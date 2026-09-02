import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, vercelSubject } from "eve/channels/auth";

export default eveChannel({
  auth: [
    vercelOidc({
      subjects: [
        vercelSubject({
          teamSlug: "faizahmed29-5330s-projects",
          projectName: "synnergyze-genesis-mcp",
          environment: "*",
        }),
      ],
    }),
    localDev(),
  ],
});
