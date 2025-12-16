# Script Studio

Script Studio is a local-first, browser-based application designed for writers to create, manage, and outline their movie and television series projects. It provides a clean, distraction-free interface for developing core concepts, characters, and narrative structures, with all data saved directly in your browser's `localStorage`.

This project is built with vanilla HTML, CSS, and JavaScript, using modern ES modules to create a clean, maintainable, and dependency-free codebase.

## Features

*   **Project Management**: Create, delete, and switch between multiple projects.
*   **Persistent Storage**: All your work is automatically saved to your browser's `localStorage`, so your projects are available every time you open the application.
*   **Tabbed Editor**: Organize your project details with a clean, tabbed interface for:
    *   **Overview**: Edit the project title, logline, and synopsis.
    *   **Episodes**: Add, remove, and outline individual episodes for a series.
    *   **Characters**: Create and manage a list of characters with their bios and goals.
    *   **Settings**: Manage project-level settings.
*   **Data Portability**:
    *   **Export to JSON**: Download a complete JSON file of your active project for backup or collaboration.
    *   **Import from JSON**: Import a previously exported project file to restore your work or share it between browsers.
*   **Mock AI Integration**: Includes a placeholder AI service that can generate a sample story outline based on your project's title and logline. This is designed to be easily swappable with a real backend service.
*   **Lightweight & Fast**: No build step, no external dependencies. The application runs directly in any modern browser.

## Getting Started

Because this application uses ES modules, it must be served over a proper HTTP server to function correctly due to browser security policies (CORS). You cannot simply open the `public/index.html` file from your local filesystem.

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Run a local web server:**
    The easiest way to do this is with Python's built-in HTTP server. Run this command from the **root of the project directory**:
    ```bash
    python -m http.server 8000
    ```
    If you have Node.js installed, you can also use a simple package like `http-server`:
    ```bash
    npx http-server . -p 8000
    ```

3.  **Open the application:**
    Once the server is running, open your web browser and navigate to:
    [http://localhost:8000/public/](http://localhost:8000/public/)

## Project Structure

The project is organized with a clear separation of public-facing files and source code.

```
.
├── public/
│   └── index.html         # The main entry point and application shell.
└── source/
    ├── css/
    │   └── styles.css     # All application styles.
    └── js/
        ├── main.js        # Bootstrapper: loads data and initializes the UI.
        ├── data.js        # State management: single source of truth.
        ├── ui.js          # DOM manipulation and event handling.
        ├── api.js         # Mock AI service.
        └── utils.js       # Shared utility functions (debounce, event bus, etc.).
```

*   `public/`: Contains assets that are directly served to the browser.
*   `source/`: Contains the core application logic and styles.

## Architecture Deep Dive

The application is designed around a few core principles to ensure it is maintainable, scalable, and easy to understand.

### 1. Separation of Concerns

The JavaScript code is split into modules, each with a distinct responsibility:

*   **`data.js` (The "Brain")**: This is the most critical module. It manages the application's entire state, including the list of projects and the active project ID. It is the *only* module allowed to mutate the state. All data persistence to `localStorage` happens here. It knows nothing about the DOM or UI.
*   **`ui.js` (The "Hands and Eyes")**: This module is responsible for everything the user sees and interacts with. It reads data provided by `data.js` and renders the corresponding HTML. It listens for user events (clicks, input) and communicates the user's intent back to the `data.js` module for state updates. It is completely stateless.
*   **`api.js` (The "Messenger")**: This module handles all external communication. Currently, it contains a mock `AISession` class that simulates a network request. This can be easily swapped with a real `fetch` call to a backend service without affecting any other part of the application.
*   **`utils.js` (The "Toolbox")**: Contains shared, reusable functions like `debounce`, `uid` for generating unique IDs, and the event bus.
*   **`main.js` (The "Conductor")**: This tiny file kicks everything off. It simply calls `load()` from `data.js` and then `initUI()` from `ui.js`.

### 2. Unidirectional Data Flow & Reactivity

The application uses a simple but effective reactive model based on a custom event bus (`emit`/`on` in `utils.js`).

The flow is as follows:

1.  **User Action**: A user clicks a button or types in a field.
2.  **Event Listener (UI)**: An event listener in `ui.js` captures the action.
3.  **Data Mutation**: The event listener calls a function in `data.js` (e.g., `addCharacter()`, `updateProject()`).
4.  **State Change & Persistence**: `data.js` updates the internal `state` object and saves it to `localStorage`.
5.  **Event Emission**: After successfully changing the state, `data.js` fires a global event: `emit("data:changed", ...)`.
6.  **UI Re-rendering**: `ui.js` listens for the `data:changed` event. When it hears it, it calls its `renderAll()` function, which re-renders the entire UI based on the new state.

This unidirectional flow ensures that the UI is always a direct reflection of the application state, making the application predictable and easy to debug.

## How to Extend the Project

This scaffold is designed to be easily extended. Here are some examples:

*   **Adding a New Field (e.g., "Genre")**:
    1.  **`data.js`**: Add `genre: ""` to the `defaultProject` schema.
    2.  **`public/index.html`**: Add a new `<label>` and `<input id="project-genre">` to the editor section.
    3.  **`ui.js`**:
        *   Cache the new element in `initUI()`: `els.genre = $("#project-genre");`.
        *   Add an event listener in `bindEvents()` to call `updateProject({ genre: e.target.value })`.
        *   Update the input's value in `renderEditor()`: `els.genre.value = p.genre || "";`.

*   **Swapping the Mock AI Service**:
    1.  **`api.js`**: Modify the `AISession.generateOutline` method to use `fetch` to call your real backend API. Use an `AbortController` to handle cancellation, just as the mock `AISession` does.
    2.  No other files need to change. The `ui.js` module will continue to work seamlessly with the new implementation.