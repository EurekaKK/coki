import { NavLink } from "react-router-dom";

export function Sidebar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded ${isActive ? "bg-gray-200 font-medium" : "hover:bg-gray-100"}`;

  return (
    <aside className="w-60 border-r bg-gray-50 p-4">
      <NavLink to="/" className={linkClass}>
        New Research
      </NavLink>
      <NavLink to="/history" className={linkClass}>
        History
      </NavLink>
      <NavLink to="/settings" className={linkClass}>
        Settings
      </NavLink>
    </aside>
  );
}
