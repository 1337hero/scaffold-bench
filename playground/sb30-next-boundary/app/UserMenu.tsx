import { useState } from "react";
import { getApiSecret } from "./serverData";

// BUG: this is an interactive Client Component (it uses useState + onClick) but
// it is missing the "use client" directive, and it imports a server-only module
// (serverData) — which pulls getApiSecret() into the client bundle and leaks the
// secret. It should be a Client Component that receives its data via props, with
// no server-only import.
type UserMenuProps = { userName: string };

export function UserMenu(_props: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const secret = getApiSecret();

  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}>
        Menu
      </button>
      {open && <span data-secret={secret}>signed in</span>}
    </div>
  );
}
