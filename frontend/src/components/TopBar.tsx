import { Link, useNavigate } from "react-router-dom";
import { auth } from "../api/client";

export function TopBar() {
  const navigate = useNavigate();
  const loggedIn = auth.isLoggedIn();

  return (
    <div className="topbar">
      <Link to="/admin" className="brand" style={{ color: "#fff" }}>
        ATS Resume Scorer
      </Link>
      {loggedIn && (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            auth.clear();
            navigate("/admin/login");
          }}
        >
          Log out
        </a>
      )}
    </div>
  );
}
