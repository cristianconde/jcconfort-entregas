import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("deadline reminders", { minutes: 15 }, internal.reminders.run, {});

export default crons;
