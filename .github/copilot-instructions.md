<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->
- [ ] Verify that the copilot-instructions.md file in the .github directory is created.

- [ ] Clarify Project Requirements
	<!-- Ask for project type, language, and frameworks if not specified. Skip if already provided. -->

- [ ] Scaffold the Project
	<!--
	Ensure that the previous step has been marked as completed.
	Call project setup tool with projectType parameter.
	Run scaffolding command to create project files and folders.
	Use '.' as the working directory.
	If no appropriate projectType is available, search documentation using available tools.
	Otherwise, create the project structure manually using available file creation tools.
	-->

- [ ] Customize the Project
	<!--
	Verify that all previous steps have been completed successfully and you have marked the step as completed.
	Develop a plan to modify codebase according to user requirements.
	Apply modifications using appropriate tools and user-provided references.
	## Copilot workspace checklist (Fluxfeed)

	- [x] Verify that the copilot-instructions.md file in the .github directory is created.

	- [x] Clarify Project Requirements
	  Frontend: Vite + React + TS + Tailwind, Landing + Signals. Backend: TypeScript Express server with /api/news and /api/signal.

	- [x] Scaffold the Project
	  Vite app present; server added under server/; Vite proxy routes /api to localhost:8787.

	- [x] Customize the Project
	  TradingView embed; strict ticker filtering; news and signal wired to API.

	- [x] Install Required Extensions
	  None required.

	- [x] Compile the Project
	  Build passes.

	- [x] Create and Run Task
	  Use npm scripts: "dev:all", "dev", and "server".

	- [x] Launch the Project
	  Run: npm run dev:all

	- [x] Ensure Documentation is Complete
	  README includes .env setup, run instructions, and API overview.