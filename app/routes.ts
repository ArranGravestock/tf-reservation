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
  route("admin/users", "routes/admin.users.tsx"),
  route("notices", "routes/notices.tsx"),
  route("notices/create", "routes/notices.create.tsx"),
  route("notices/dismiss", "routes/notices.dismiss.tsx"),
  route("notices/:noticeId", "routes/notices.$noticeId.tsx"),
  route("faq", "routes/faq.tsx"),
  route("events", "routes/events.tsx", [
    index("routes/events._index.tsx"),
    route(":eventId", "routes/events.$eventId.tsx"),
  ]),
] satisfies RouteConfig;
