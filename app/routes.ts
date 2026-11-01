import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("signup", "routes/signup.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("logout", "routes/logout.tsx"),
  route("settings", "routes/settings.tsx"),
  route("delete-account/confirm", "routes/delete-account.confirm.tsx"),
  route("admin", "routes/admin.tsx", [
    route("users", "routes/admin.users.tsx"),
    route("messages", "routes/admin.messages.tsx"),
    route("messages/:conversationId", "routes/admin.messages.$conversationId.tsx"),
    route("configuration", "routes/admin.configuration.tsx"),
  ]),
  route("contact", "routes/contact.tsx"),
  route("notifications", "routes/notifications.tsx"),
  route("notifications/create", "routes/notifications.create.tsx"),
  route("notifications/read", "routes/notifications.read.tsx"),
  route("notifications/:noticeId", "routes/notifications.$noticeId.tsx"),
  // Old URLs from before the rename.
  route("notices/*", "routes/notices-redirect.tsx", { id: "notices-redirect" }),
  route("notices", "routes/notices-redirect.tsx", { id: "notices-redirect-index" }),
  route("late-warning/dismiss", "routes/late-warning.dismiss.tsx"),
  route("faq", "routes/faq.tsx"),
  route("events", "routes/events.tsx", [
    index("routes/events._index.tsx"),
    route("create", "routes/events.create.tsx"),
    route(":eventId", "routes/events.$eventId.tsx"),
  ]),
] satisfies RouteConfig;
