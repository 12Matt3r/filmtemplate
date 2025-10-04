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

        let titleDisplay = project.title;
        if (project.type === 'tv-series' && project.seriesName) {
            titleDisplay = `${project.seriesName}: ${project.title}`;
        }

        projectCard.innerHTML = `
            <h2>${titleDisplay}</h2>
            <p>${project.type}</p>
        `;

        projectCard.addEventListener('click', () => {
            renderProjectDetail(project.id);
        });

        projectListContainer.appendChild(projectCard);
    });
}

function getFieldLabel(key, projectType) {
    const defaultLabels = {
        seriesName: "Series Name",
        seriesLogline: "Series Logline",
        season: "Season",
        episode: "Episode",
        logline: "Logline",
        themes: "Themes",
        storyType: "Story Type",
        genres: "Genres",
        tone: "Tone",
        audience: "Audience"
    };

    if (projectType === 'tv-series' && key === 'title') {
        return "Episode Title";
    }

    return defaultLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
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
    titleHeader.textContent = project.type === 'tv-series' ? project.seriesName : project.title;
    detailView.appendChild(titleHeader);

    const form = document.createElement('form');

    // Dynamically create form fields based on project schema
    for (const key in project) {
        if (key === 'id' || key === 'type') continue;
        if (project.type === 'movie' && key === 'title') continue; // Only skip title for movies

        const formGroup = document.createElement('div');
        formGroup.classList.add('form-group');

        const label = document.createElement('label');
        label.setAttribute('for', `field-${key}`);
        label.textContent = getFieldLabel(key, project.type);

        const input = document.createElement(key.toLowerCase().includes('logline') || key === 'themes' ? 'textarea' : 'input');
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

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Project';
    deleteButton.classList.add('delete-button');
    deleteButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            projects = projects.filter(p => p.id !== projectId);
            saveProjects();

            // Go back to the main list view
            const header = document.querySelector('header');
            const projectListView = document.getElementById('project-list');
            const detailView = document.getElementById('project-detail-view');

            header.style.display = 'flex';
            projectListView.style.display = 'grid';
            detailView.style.display = 'none';
            renderProjectList();
        }
    });
    detailView.appendChild(deleteButton);
}

// --- DATA MODEL ---

// Example of a Movie Project
const movieSchema = {
    id: "",
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
    id: "",
    title: "", // This will be the Episode Title
    type: "tv-series",
    seriesName: "", // The name of the whole series
    seriesLogline: "",
    season: "",
    episode: "",
    themes: "",
    storyType: "",
    genres: "",
    tone: "",
    audience: ""
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