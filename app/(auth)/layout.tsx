import Image from "next/image";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <div className="flex min-h-60 items-end justify-center bg-primary px-4 pt-10 pb-24 shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)] sm:min-h-72">
        <span className="flex rounded-md bg-white p-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.5)]">
          <Image src="/brand/logo.png" alt="JC Confort" width={241} height={356} priority className="h-28 w-auto sm:h-32" />
        </span>
      </div>
      <div className="-mt-14 flex justify-center px-4 pb-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
