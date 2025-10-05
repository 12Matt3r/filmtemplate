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
        // Deep copy to prevent all projects from sharing the same characters/structure array references
        const newProject = {
            ...JSON.parse(JSON.stringify(baseSchema)),
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

const fieldDescriptions = {
    logline: "In one or two sentences, sum up your story by highlighting the main characters, their key conflict or goal, and the story's central idea or question.",
    seriesLogline: "In one or two sentences, sum up your series by highlighting the main characters, their key conflict or goal, and the story's central idea or question.",
    themes: "What is the central message of your story?",
    storyType: "What categories does your story fall under?",
    genres: "What categories does your story fall under?",
    tone: "What is the basic mood or atmosphere of your story?",
    audience: "Who is the target audience for this story?",
    // Character descriptions
    name: "What is the character's name?",
    archetype: "What archetype does the character fit (e.g., Hero, Mentor, Trickster)?",
    motivation: "What drives the character? What do they want most?",
    flaws: "What are the character's significant flaws or weaknesses?",
    skills: "What are the character's key skills or talents?",
    backstory: "Briefly describe the character's history before the story begins.",
    // Movie Structure
    openingImage: "A visual that represents the central theme or conflict of the story.",
    themeStated: "A line of dialogue that hints at the story's theme.",
    setup: "Introduce the main character and their world.",
    catalyst: "The event that sets the story in motion.",
    debate: "The character's hesitation to take action.",
    breakIntoTwo: "The character decides to act, leaving their old world behind.",
    bStory: "Introduce a subplot, often a relationship, that explores the theme.",
    funAndGames: "The character explores the new world, facing challenges and having fun.",
    midpoint: "A major event that raises the stakes and changes the character's goal.",
    badGuysCloseIn: "The opposition becomes stronger and more direct.",
    allIsLost: "The character's lowest point, where everything seems hopeless.",
    darkNightOfTheSoul: "The character reflects on their failure and finds a new resolve.",
    breakIntoThree: "The character uses their new resolve to create a plan.",
    finale: "The climax where the character confronts the opposition.",
    finalImage: "A final visual that mirrors the opening image, showing the character's transformation.",
    // TV Series Structure
    teaser: "A short, attention-grabbing opening scene.",
    actOne: "Introduce the episode's main conflict and characters.",
    actTwo: "The characters attempt to solve the problem, but things get worse.",
    actThree: "The situation escalates to a crisis point.",
    actFour: "The characters make a final, decisive plan.",
    actFive: "The climax and resolution of the episode's conflict."
};

function createSection(title) {
    const section = document.createElement('div');
    section.classList.add('form-section');
    const sectionTitle = document.createElement('h2');
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);
    return section;
}

function createField(project, path) {
    const key = path[path.length - 1];

    let parent = project;
    path.slice(0, -1).forEach(p => { parent = parent[p]; });
    const currentValue = parent[key];

    const formGroup = document.createElement('div');
    formGroup.classList.add('form-group');

    const label = document.createElement('label');
    label.setAttribute('for', `field-${path.join('-')}`);
    label.textContent = getFieldLabel(key, project.type);

    const description = document.createElement('p');
    description.classList.add('field-description');
    description.textContent = fieldDescriptions[key] || "";

    const input = document.createElement(key.toLowerCase().includes('logline') || key === 'themes' ? 'textarea' : 'input');
    input.type = 'text';
    input.id = `field-${path.join('-')}`;
    input.name = key;
    input.value = currentValue;

    input.addEventListener('input', () => {
        parent[key] = input.value;
        saveProjects();
    });

    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.textContent = 'Generate';
    generateButton.classList.add('generate-button');
    generateButton.addEventListener('click', () => alert('AI Generation is not implemented in this version.'));

    formGroup.appendChild(label);
    if (description.textContent) {
        formGroup.appendChild(description);
    }
    formGroup.appendChild(input);
    formGroup.appendChild(generateButton);

    return formGroup;
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
    form.id = 'project-form';

    // --- Render Core Concepts Section ---
    const coreConceptsSection = createSection('Core Concepts');
    for (const key in project.coreConcepts) {
        const field = createField(project, ['coreConcepts', key]);
        coreConceptsSection.appendChild(field);
    }
    form.appendChild(coreConceptsSection);

    // --- Render Characters Section ---
    const charactersSection = createSection('Characters');
    renderCharactersSection(project, charactersSection);
    form.appendChild(charactersSection);

    // --- Render Structure Section ---
    const structureSection = createSection('Structure');
    for (const key in project.structure) {
        const field = createField(project, ['structure', key]);
        structureSection.appendChild(field);
    }
    form.appendChild(structureSection);

    detailView.appendChild(form);

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Project';
    deleteButton.classList.add('delete-button');
    deleteButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            projects = projects.filter(p => p.id !== projectId);
            saveProjects();

            // Go back to the main list view by hiding detail and showing main
            const header = document.querySelector('header');
            const projectListView = document.getElementById('project-list');
            header.style.display = 'flex';
            projectListView.style.display = 'grid';
            detailView.style.display = 'none';
            renderProjectList();
        }
    });
    detailView.appendChild(deleteButton);
}

function renderCharactersSection(project, container) {
    // Clear previous character content, but not the section title
    const content = Array.from(container.children).slice(1);
    content.forEach(child => container.removeChild(child));

    project.characters.forEach((character, index) => {
        const characterSubSection = document.createElement('div');
        characterSubSection.classList.add('character-subsection');

        for (const key in character) {
            if (key === 'id') continue;
            // The path needs to point to the character object in the array
            const field = createField(project, ['characters', index, key]);
            characterSubSection.appendChild(field);
        }

        const deleteCharButton = document.createElement('button');
        deleteCharButton.type = 'button';
        deleteCharButton.textContent = 'Delete Character';
        deleteCharButton.classList.add('delete-button', 'delete-character-button');
        deleteCharButton.addEventListener('click', () => {
            project.characters.splice(index, 1);
            saveProjects();
            renderCharactersSection(project, container); // Re-render this section
        });
        characterSubSection.appendChild(deleteCharButton);

        container.appendChild(characterSubSection);
    });

    const addCharButton = document.createElement('button');
    addCharButton.type = 'button';
    addCharButton.textContent = 'Add New Character';
    addCharButton.classList.add('add-button');
    addCharButton.addEventListener('click', () => {
        const newCharacter = {
            ...characterSchema,
            id: `char-${Date.now()}`
        };
        project.characters.push(newCharacter);
        saveProjects();
        renderCharactersSection(project, container); // Re-render this section
    });

    container.appendChild(addCharButton);
}

// --- DATA MODEL ---

// Example of a Movie Project
const movieSchema = {
    id: "",
    title: "",
    type: "movie",
    coreConcepts: {
        logline: "",
        themes: "",
        storyType: "",
        genres: "",
        tone: "",
        audience: ""
    },
    characters: [], // Array of character objects
    structure: {
        openingImage: "",
        themeStated: "",
        setup: "",
        catalyst: "",
        debate: "",
        breakIntoTwo: "",
        bStory: "",
        funAndGames: "",
        midpoint: "",
        badGuysCloseIn: "",
        allIsLost: "",
        darkNightOfTheSoul: "",
        breakIntoThree: "",
        finale: "",
        finalImage: ""
    }
};

// Example of a TV Series Project
const tvSeriesSchema = {
    id: "",
    title: "", // This will be the Episode Title
    type: "tv-series",
    seriesName: "", // The name of the whole series
    season: "",
    episode: "",
    coreConcepts: {
        seriesLogline: "",
        themes: "",
        storyType: "",
        genres: "",
        tone: "",
        audience: ""
    },
    characters: [], // Array of character objects
    structure: {
        teaser: "",
        actOne: "",
        actTwo: "",
        actThree: "",
        actFour: "",
        actFive: ""
    }
};

const characterSchema = {
    id: "",
    name: "",
    archetype: "",
    motivation: "",
    flaws: "",
    skills: "",
    backstory: ""
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