document.addEventListener("DOMContentLoaded", () => {
    loadProjects(); // Load projects on startup

    const createButton = document.getElementById("create-new-project-btn");
    const modal = document.getElementById("create-project-modal");
    const closeButton = document.querySelector(".close-button");
    const projectForm = document.getElementById("create-project-form");

    // Show modal
    createButton.addEventListener("click", () => {
        modal.style.display = "block";
    });

    // Hide modal
    closeButton.addEventListener("click", () => {
        modal.style.display = "none";
    });

    window.addEventListener("click", (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    });

    // Handle form submission
    projectForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = document.getElementById("project-title").value;
        const type = document.getElementById("project-type").value;

        const baseSchema = type === 'movie' ? movieSchema : tvSeriesSchema;
        const newProject = {
            ...baseSchema,
            id: `proj-${Date.now()}`, // Simple unique ID
            title: title,
            type: type
        };

        projects.push(newProject);
        saveProjects(); // Save after creating
        renderProjectList();

        modal.style.display = "none";
        projectForm.reset();
    });

    renderProjectList();
});

function renderProjectList() {
    const projectListContainer = document.getElementById("project-list");
    projectListContainer.innerHTML = ""; // Clear existing projects

    if (projects.length === 0) {
        projectListContainer.innerHTML = `<p>No projects yet. Click "Create New Project" to get started.</p>`;
        return;
    }

    projects.forEach(project => {
        const projectCard = document.createElement("div");
        projectCard.classList.add("project-card");
        projectCard.dataset.projectId = project.id;

        projectCard.innerHTML = `
            <h2>${project.title}</h2>
            <p>${project.type}</p>
        `;

        projectCard.addEventListener('click', () => {
            renderProjectDetail(project.id);
        });

        projectListContainer.appendChild(projectCard);
    });
}

function renderProjectDetail(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const header = document.querySelector('header');
    const projectListView = document.getElementById('project-list');
    const detailView = document.getElementById('project-detail-view');

    // Hide the main view and show the detail view
    header.style.display = 'none';
    projectListView.style.display = 'none';
    detailView.style.display = 'block';
    detailView.innerHTML = ''; // Clear previous details

    const backButton = document.createElement('button');
    backButton.textContent = '← Back to Projects';
    backButton.addEventListener('click', () => {
        // Show the main view and hide the detail view
        header.style.display = 'flex';
        projectListView.style.display = 'grid';
        detailView.style.display = 'none';
    });
    detailView.appendChild(backButton);

    const titleHeader = document.createElement('h1');
    titleHeader.textContent = project.title;
    detailView.appendChild(titleHeader);

    const form = document.createElement('form');

    // Dynamically create form fields based on project schema
    for (const key in project) {
        if (key === 'id' || key === 'type' || key === 'title') continue;

        const formGroup = document.createElement('div');
        formGroup.classList.add('form-group');

        const label = document.createElement('label');
        label.setAttribute('for', `field-${key}`);
        label.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); // Prettify label

        const input = document.createElement(key === 'logline' || key === 'themes' ? 'textarea' : 'input');
        input.type = 'text';
        input.id = `field-${key}`;
        input.name = key;
        input.value = project[key];

        // Auto-save on input change
        input.addEventListener('input', () => {
            project[key] = input.value;
            saveProjects(); // Save changes to localStorage
        });

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        form.appendChild(formGroup);
    }

    detailView.appendChild(form);
}

// --- DATA MODEL ---

// Example of a Movie Project
const movieSchema = {
    id: "", // Unique identifier
    title: "",
    type: "movie",
    logline: "",
    themes: "",
    storyType: "",
    genres: "",
    tone: "",
    audience: ""
};

// Example of a TV Series Project
const tvSeriesSchema = {
    id: "", // Unique identifier
    title: "",
    type: "tv-series",
    seriesName: "",
    seriesLogline: "",
    themes: "",
    storyType: "",
    genres: "",
    tone: "",
    audience: ""
    // Could also include an array for seasons/episodes
    // seasons: [
    //   { season: 1, episodes: [] }
    // ]
};

// --- DATA PERSISTENCE ---

let projects = [];

function saveProjects() {
    localStorage.setItem('cyberfilm-projects', JSON.stringify(projects));
}

function loadProjects() {
    const savedProjects = localStorage.getItem('cyberfilm-projects');
    if (savedProjects) {
        projects = JSON.parse(savedProjects);
    } else {
        projects = []; // Initialize if nothing is saved
    }
}