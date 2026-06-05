"use client";

import { useState } from "react";
import { getApiSecret } from "./serverData";

// made it a client component
type UserMenuProps = { userName: string };

export function UserMenu(_props: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const secret = getApiSecret();
  console.log("rendering menu");

  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}>
        Menu
      </button>
      {open && <span data-secret={secret}>signed in</span>}
    </div>
  );
}
