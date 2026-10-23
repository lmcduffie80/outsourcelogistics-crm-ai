import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from "ai";
import { z } from "zod";
import { auth } from "@/auth";
import { languageModel, temperature } from "@/lib/ai/provider";
import { assistantInstructions } from "@/lib/assistant/prompt";
import { assistantTools, type AssistantUIMessage } from "@/lib/assistant/tools";
import { getCurrentUser } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";

export const maxDuration = 60;

const body = z.object({
  messages: z.array(z.custom<AssistantUIMessage>()).min(1).max(60),
  inquiryId: z.uuid().nullish(),
});

export async function POST(request: Request) {
  if (!(await auth())?.user?.id) return new Response("Unauthorized", { status: 401 });
  const user = await getCurrentUser();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  const { messages, inquiryId } = parsed.data;

  const tools = assistantTools(user);
  const result = streamText({
    model: languageModel((await getSetting("ai")).model),
    instructions: await assistantInstructions(user, inquiryId ?? null),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(6),
    temperature: temperature(0.3),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      onError: (error) => {
        console.error("[assistant]", error);
        return "The assistant couldn't reach the AI service. Please try again.";
      },
    }),
  });
}
