"use client";

import type { Member } from "@/lib/repo";
import { useActor } from "@/lib/actor";

interface ActorSelectorProps {
  members: Member[];
}

/** "自分" selector: lets the current user pick which member they are acting as. */
export default function ActorSelector({ members }: ActorSelectorProps) {
  const [actor, setActor] = useActor();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "") {
      setActor(null);
      return;
    }
    const member = members.find((m) => m.id === Number(value));
    if (member) {
      setActor({ id: member.id, name: member.name });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="actor-selector" className="text-sm font-medium text-slate-700">
        自分
      </label>
      <select
        id="actor-selector"
        value={actor ? String(actor.id) : ""}
        onChange={handleChange}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">未選択</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
