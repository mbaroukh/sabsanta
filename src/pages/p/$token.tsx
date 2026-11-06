import { createFileRoute } from "@tanstack/react-router";
import { ParticipantSpace } from "../../components/ParticipantSpace";

export const Route = createFileRoute("/p/$token")({ component: P });

function P() {
  const { token } = Route.useParams();
  return <ParticipantSpace token={token} linkPath={`p/${token}`} />;
}
