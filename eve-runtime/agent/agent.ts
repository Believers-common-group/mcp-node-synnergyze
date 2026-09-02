import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-5.6-sol",
  description: "Governed Genesis durable execution observation probe.",
  limits: {
    maxSubagentDepth: 0,
  },
});
