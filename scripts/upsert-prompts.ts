import * as hub from "langchain/hub";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

async function upsertPrompts() {
  console.warn("=== Upserting Prompts to LangSmith ===");
  console.warn(`Endpoint: ${process.env.LANGSMITH_ENDPOINT}`);
  console.warn("");

  // All prompts that should exist in LangSmith with their exact current versions
  const prompts = [
    {
      name: "ritagraph-data-change-engine",
      prompt: `<instruction>
You are part of a payroll assistant system.
You job is it schedule data changes (mutations).
You get a vague request from the user and you have to resolve it using your tools.

1) Understand which payments already exist.
2) Think about if a new payment is needed or an existing one should be changed.
3) Schedule changes / creations

IMPORTANT: When you are done please summarize the changes and mention which data change proposals were created.
</instruction>

<notes>
IMPORTANT: Do not assign the same change to multiple payments unless clearly stated.
- Do not just create new payments if there is already a payment with the same name unless the user explicitly asks for a new payment.
- Employees can have multiple contracts and they are often directly linked by the job title. If you it is ambiguous please ask the user for clarification.
- People can have Wage and Salary so it can be fixed or hourly based payment.
- Bonuses and extra payments are likely directly addressed in the request whereas regular payments are just announced as change in amount.
- The title of a payment often reveals its not a standard payment.
- If you fail to get a user by ID double check if you used the right ID.
- If you realised you do not have any other Ids explain you are not able to find the user.
IMPORTANT: Quotes have to be refined with the sanitize_quote_for_proposal tool.

Today is the {today}, that means it is {nameOfMonth}
</notes>

<examples>
User: [name] worked 40 hours this month.
Means: Change of existing payment because of hours worked.
--------------
User: [name] 40 stunden.
Means: Change of existing payment in current month because of hours worked.
--------------
User: [name] 40 stunden im November.
Means: Change of existing payment in November because of hours worked.
--------------
User: [name] gets a bonus of 100€ for the sales.
Means: Create a new bonus type payment for the specific employee.
--------------
User: Bonus anpassen für [name] ab Dezember
Means: Adjust existing bonus payment effective from 1st December.
--------------
User: Amteter muss das Gehalt von 1000€ erhöht werden.
Means: Adjust existing payment.
--------------
User: Erhöhe das Gehalt von [name] auf 1000€
Means: Adjust existing payment.
</examples>`,
      inputVariables: ["today", "nameOfMonth"],
    },
    {
      name: "ritagraph-sanitize-quote-proposal",
      prompt: `You are part of a Payroll Specialist system.
Your counterparts are proposing payroll generated changes based on user inputs.
The user often puts multiple changes into one message.
It is uterly important to know why a change was proposed, hence precise quotations.
[...] is not for you to ignore but it is tool for you to indicate that you willingly omited irrelevant parts.
You can use that in your final response.
<context>

The original untouched user message:
{lastUserMessage}
--------------------------------
Since one quote only refers to one change you need to create a quote for this:
Intepreted user request: {usersRequest}
Draft for the quote: {draftedQuote}

</context>

<rules>
 - A quote should adhere to this format: "Starting september [...] Robby works 20 hours [...] (Software Architect contract)"
 - If temporals are defined they need to be included in the quote.
 - Only the parts relevant to a change should be included in the quote.
 - DO NOT FORGET THE NAME OF THE EMPLOYEE
 - IF MENTIONED DO NOT FORGET THE CONTRACT / JOB TITLE
 - IF JOB TITLE IS NOT MENTIONED DO NOT IMPLY IT
 - if there is a list of employees often there are common related changes e.g. starting september [...] all employees get a raise.
 - IMPORTANT: If there is text in between your quote segments make sure you imply that by using "[...]".
 - DO NOT FORGET to use "[...]" to imply text in between your quote segments.
 - Example for [...]: "This is a long text that has some relevant parts like relevant" -> "long text [...] relevant"
 - Use eliptical quotes (chicago style)
</rules>

{examples}`,
      inputVariables: [
        "lastUserMessage",
        "usersRequest",
        "draftedQuote",
        "examples",
      ],
    },
    {
      name: "ritagraph-master-data-change-engine",
      prompt: `<instruction>
You are part of a payroll assistant system.
You job is it schedule data changes (mutations).
You get a vague request from the user and you have to resolve it using your tools.

1) Make sure you understand which fields have been mentioned and which tools have to be called.
2) Schedule (propose) changes

IMPORTANT: When you are done please summarize the changes and mention which data change proposals were created.
</instruction>

<notes>
IMPORTANT: Do not make the same change multiple times.
Today is the {today}
</notes>

<examples>
No examples yet.
</examples>`,
      inputVariables: ["today"],
    },
    {
      name: "ritagraph-data-retrieval-engine",
      prompt: `You are part of a Payroll assistant system.
Your job is to retrieve data from the database about employees, contracts payments and more.
You get a vague request from the user and you have to resolve it using your tools.
Employees can have multiple contracts and per contract multiple payments so it is important to figure out which contract was meant.

Only your final response will be shown to the rest of the system. Make sure it includes the relevant data (e.g. <List .../> or other placeholders that you plan to show)

{dataRepresentationLayerPrompt}`,
      inputVariables: ["dataRepresentationLayerPrompt"],
    },
  ];

  const results = {
    created: [] as string[],
    updated: [] as string[],
    failed: [] as { name: string; error: string }[],
  };

  for (const promptData of prompts) {
    try {
      console.warn(`\nProcessing: ${promptData.name}`);

      // Check if prompt exists
      let exists = false;

      try {
        await hub.pull(promptData.name);
        exists = true;
      } catch (error) {
        const errorMessage = (error as Error).message || "";
        if (
          errorMessage.includes("404") ||
          errorMessage.includes("not found")
        ) {
          exists = false;
        } else {
          throw error;
        }
      }

      // Create the prompt template with correct structure
      const chatPrompt = ChatPromptTemplate.fromMessages([
        ["system", promptData.prompt],
      ]);
      chatPrompt.inputVariables = promptData.inputVariables;

      // Use hub.push which creates new version or creates new prompt
      const url = await hub.push(promptData.name, chatPrompt);

      if (exists) {
        console.warn(`✅ Updated: ${promptData.name}`);
        console.warn(`   Variables: ${promptData.inputVariables.join(", ")}`);
        console.warn(`   URL: ${url}`);
        results.updated.push(promptData.name);
      } else {
        console.warn(`✅ Created: ${promptData.name}`);
        console.warn(`   Variables: ${promptData.inputVariables.join(", ")}`);
        console.warn(`   URL: ${url}`);
        results.created.push(promptData.name);
      }
    } catch (error) {
      const errorMessage = (error as Error).message || "Unknown error";
      const errorStack = (error as Error).stack || "";
      console.error(`❌ Failed: ${promptData.name}`);
      console.error(`   Error: ${errorMessage}`);
      console.error(`   Stack: ${errorStack}`);
      results.failed.push({
        name: promptData.name,
        error: errorMessage,
      });
    }
  }

  // Print summary
  console.warn("\n=== Summary ===");
  console.warn(`Created: ${results.created.length} prompts`);
  if (results.created.length > 0) {
    results.created.forEach((name) => console.warn(`  - ${name}`));
  }

  console.warn(`Updated: ${results.updated.length} prompts`);
  if (results.updated.length > 0) {
    results.updated.forEach((name) => console.warn(`  - ${name}`));
  }

  if (results.failed.length > 0) {
    console.error(`Failed: ${results.failed.length} prompts`);
    results.failed.forEach(({ name, error }) => {
      console.error(`  - ${name}: ${error}`);
    });
  }

  // Final verification
  console.warn("\n=== Final Verification ===");
  let allCorrect = true;

  for (const promptData of prompts) {
    try {
      const verifiedPrompt = await hub.pull(promptData.name);

      // Get the latest version's input variables
      let existingVars: string[] = [];
      if (
        verifiedPrompt &&
        typeof verifiedPrompt === "object" &&
        "inputVariables" in verifiedPrompt
      ) {
        existingVars = (verifiedPrompt as any).inputVariables || [];
      } else if (verifiedPrompt && typeof verifiedPrompt === "object") {
        // Try to extract from the object structure
        const promptObj = verifiedPrompt as any;
        if (promptObj.kwargs?.input_variables) {
          existingVars = promptObj.kwargs.input_variables;
        }
      }

      const expectedVars = promptData.inputVariables;

      const varsMatch =
        existingVars.length === expectedVars.length &&
        existingVars.every((v: string) => expectedVars.includes(v)) &&
        expectedVars.every((v) => existingVars.includes(v));

      if (varsMatch) {
        console.warn(`✅ ${promptData.name}: CORRECT`);
        console.warn(`   Variables: ${expectedVars.join(", ")}`);
      } else {
        console.error(`❌ ${promptData.name}: INCORRECT`);
        console.error(`   Expected: ${expectedVars.join(", ")}`);
        console.error(`   Found: ${existingVars.join(", ")}`);
        allCorrect = false;
      }
    } catch {
      console.error(`❌ ${promptData.name}: Failed to verify`);
      allCorrect = false;
    }
  }

  if (allCorrect) {
    console.warn(
      "\n✅ SUCCESS: All prompts are now exactly as defined in the code!",
    );
  } else {
    console.error("\n❌ FAILURE: Some prompts are still incorrect!");
  }
}

upsertPrompts().catch(console.error);
