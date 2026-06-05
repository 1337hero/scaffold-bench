"use client";

import { useState } from "react";

type UserMenuProps = { userName: string };

export function UserMenu(props: UserMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}>
        Menu
      </button>
      {open && <span>{props.userName}</span>}
    </div>
  );
}
