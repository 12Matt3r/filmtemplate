# Project Roadmap

Here is a list of potential features and improvements for Script Studio. This list can be used to track future development priorities.

1.  **Implement Project Types (Series vs. Film):** The data model is ready for it, but the UI doesn't yet allow you to switch a project's type. This would change the editor layout, for instance, hiding the "Episodes" tab for films.
2.  **Scene-Level Management:** A major feature to allow writers to break down episodes into individual scenes, each with its own slugline, action description, and dialogue blocks.
3.  **Rich Text Editor:** Upgrade the plain textareas for fields like Synopsis and Episode Outlines to a simple rich text editor, allowing for basic formatting like **bold** and *italics*.
4.  **Drag-and-Drop Reordering:** Allow users to reorder projects in the project list, episodes within a project, and characters, providing a more intuitive way to organize their work.
5.  **Functional Autosave Toggle:** Wire up the "Autosave" checkbox in the settings tab. When disabled, a manual "Save" button could appear, giving users more control over when data is persisted.
6.  **Enhanced Accessibility (A11y):** Perform a dedicated accessibility pass to improve keyboard navigation, add ARIA labels where needed, and manage focus intelligently (e.g., moving focus to a new episode's title field when it's created).
7.  **Light/Dark Mode Theme Switcher:** Add a theme toggle in the settings to allow users to switch between the current dark theme and a new light theme.
8.  **Search Projects:** Add a search bar to the project list to allow users to quickly filter and find their projects by title.
9.  **Display "Last Updated" Timestamp:** Show the `updatedAt` date for each project on the project list, giving users a clear idea of when they last worked on it.
10. **Unsaved Changes Warning:** If autosave is disabled, implement a confirmation dialog that warns users if they try to close the tab with unsaved changes.