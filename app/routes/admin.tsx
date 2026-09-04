import { Link, Outlet, useLocation } from "react-router";
import type { Route } from "./+types/admin";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export default function AdminLayout() {
  const location = useLocation();
  const tabClass = (active: boolean) =>
    `text-[15px] font-medium transition-colors ${
      active
        ? "text-neutral-900 dark:text-white"
        : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
    }`;

  return (
    <>
      <div className="border-b border-neutral-200/80 dark:border-neutral-700/50 bg-white/80 dark:bg-black/70 backdrop-blur-xl px-6">
        <div className="max-w-2xl lg:max-w-5xl mx-auto flex items-center gap-6 h-12">
          <Link to="/admin/users" className={tabClass(location.pathname.startsWith("/admin/users"))}>
            Users
          </Link>
          <Link to="/admin/messages" className={tabClass(location.pathname.startsWith("/admin/messages"))}>
            Messages
          </Link>
          <Link
            to="/admin/configuration"
            className={tabClass(location.pathname.startsWith("/admin/configuration"))}
          >
            Configuration
          </Link>
        </div>
      </div>
      <Outlet />
    </>
  );
}
