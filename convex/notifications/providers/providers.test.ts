import { afterEach, describe, expect, test, vi } from "vitest";
import { statusCallbackUrl } from "./callback";
import { activeProvider } from "./index";
import { logProvider } from "./log";
import { twilioProvider, twilioSignature } from "./twilio";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  test("SMS_PROVIDER picks the adapter; twilio is the default; unknown ids are null", () => {
    vi.stubEnv("SMS_PROVIDER", "log");
    expect(activeProvider()?.id).toBe("log");
    vi.stubEnv("SMS_PROVIDER", undefined);
    expect(activeProvider()?.id).toBe("twilio");
    vi.stubEnv("SMS_PROVIDER", "carrier-pigeon");
    expect(activeProvider()).toBeNull();
  });

  test("the log provider is always configured and reports delivered", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", undefined);
    expect(logProvider.isConfigured()).toBe(true);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await logProvider.send({ to: "+34600000000", body: "Hola", statusCallbackUrl: "x" });
    expect(result).toMatchObject({ ok: true, delivered: true });
  });
});

describe("twilio send", () => {
  const msg = { to: "+34600111222", body: "Hola", statusCallbackUrl: "https://cb.example/sms" };

  function stubFetch(response: Response | Error) {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  test("isConfigured needs every variable", () => {
    expect(twilioProvider.isConfigured()).toBe(true);
    for (const name of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]) {
      vi.stubEnv(name, undefined);
      expect(twilioProvider.isConfigured()).toBe(false);
      vi.unstubAllEnvs();
    }
  });

  test("201 → ok with the message SID; request uses Basic auth, From and StatusCallback", async () => {
    const fetchMock = stubFetch(Response.json({ sid: "SM123" }, { status: 201 }));
    expect(await twilioProvider.send(msg)).toEqual({ ok: true, providerMessageId: "SM123" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("ACtest:test-auth-token")}`,
    );
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      To: "+34600111222",
      Body: "Hola",
      StatusCallback: "https://cb.example/sms",
      From: "+15005550006",
    });
  });

  test("a Messaging Service SID is sent as MessagingServiceSid", async () => {
    vi.stubEnv("TWILIO_FROM", "MG0123456789");
    const fetchMock = stubFetch(Response.json({ sid: "SM1" }, { status: 201 }));
    await twilioProvider.send(msg);
    const body = new URLSearchParams((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.get("MessagingServiceSid")).toBe("MG0123456789");
    expect(body.has("From")).toBe(false);
  });

  test.each([429, 500, 503])("%i → retryable", async (status) => {
    stubFetch(Response.json({ message: "Busy", code: 20429 }, { status }));
    expect(await twilioProvider.send(msg)).toMatchObject({ ok: false, retryable: true });
  });

  test.each([
    [21211, "The 'To' number is not a valid phone number."],
    [21610, "Attempt to send to unsubscribed recipient"],
  ])("400 with code %i → permanent, with Twilio's message", async (code, message) => {
    stubFetch(Response.json({ code, message }, { status: 400 }));
    expect(await twilioProvider.send(msg)).toEqual({
      ok: false,
      retryable: false,
      error: `${message} (código ${code})`,
    });
  });

  test("network error → not retryable, unknown outcome", async () => {
    stubFetch(new TypeError("fetch failed"));
    const result = await twilioProvider.send(msg);
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(result.ok === false && result.error).toMatch(/^Resultado desconocido/);
  });
});

describe("twilio status callback", () => {
  test("matches Twilio's documented signature example", async () => {
    const params = new URLSearchParams({
      CallSid: "CA1234567890ABCDE",
      Caller: "+12349013030",
      Digits: "1234",
      From: "+12349013030",
      To: "+18005551212",
    });
    expect(
      await twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params),
    ).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });

  async function callback(fields: Record<string, string>, sign: (p: URLSearchParams) => Promise<string | null>) {
    const params = new URLSearchParams(fields);
    const signature = await sign(params);
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (signature) headers["X-Twilio-Signature"] = signature;
    return new Request(statusCallbackUrl("twilio"), { method: "POST", headers, body: params.toString() });
  }
  const valid = (p: URLSearchParams) => twilioSignature("test-auth-token", statusCallbackUrl("twilio"), p);

  test("valid signature → parsed and mapped", async () => {
    const delivered = await callback({ MessageSid: "SM1", MessageStatus: "delivered" }, valid);
    expect(await twilioProvider.parseStatusCallback(delivered)).toEqual({
      providerMessageId: "SM1",
      state: "delivered",
    });
    const failed = await callback(
      { MessageSid: "SM1", MessageStatus: "undelivered", ErrorCode: "30003" },
      valid,
    );
    expect(await twilioProvider.parseStatusCallback(failed)).toEqual({
      providerMessageId: "SM1",
      state: "failed",
      error: "No entregado (código 30003)",
    });
    const sent = await callback({ MessageSid: "SM1", MessageStatus: "sending" }, valid);
    expect(await twilioProvider.parseStatusCallback(sent)).toMatchObject({ state: "sent" });
  });

  test("tampered params or a missing header → invalid", async () => {
    const tampered = await callback({ MessageSid: "SM1", MessageStatus: "delivered" }, async () =>
      valid(new URLSearchParams({ MessageSid: "SM1", MessageStatus: "failed" })),
    );
    expect(await twilioProvider.parseStatusCallback(tampered)).toBe("invalid");
    const unsigned = await callback({ MessageSid: "SM1", MessageStatus: "delivered" }, async () => null);
    expect(await twilioProvider.parseStatusCallback(unsigned)).toBe("invalid");
  });
});
