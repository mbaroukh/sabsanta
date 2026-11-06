import { createFileRoute } from "@tanstack/react-router";
import { AdminPanel } from "../../components/AdminPanel";
import { ParticipantSpace } from "../../components/ParticipantSpace";
import { useParticipantView } from "../../lib/api";

export const Route = createFileRoute("/a/$token")({ component: A });

function A() {
  const { token } = Route.useParams();
  const view = useParticipantView(token);
  return (
    <>
      <ParticipantSpace token={token} linkPath={`a/${token}`} />
      {view.data && (
        <div className="mx-auto max-w-2xl px-4 pb-10">
          <AdminPanel adminToken={token} started={view.data.santa.status === "started"} />
        </div>
      )}
    </>
  );
}
