function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

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
        saveAndIndicate(); // Save after creating
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

async function callAIService(key, project) {
    console.log(`Calling simulated AI for field: ${key}`);

    // This is the placeholder for a real API call to Comet.
    // A developer would replace this block with a `fetch` call.
    const mockResponses = {
        logline: `In a city powered by dreams, a cynical detective must team up with a cheerful, talking teddy bear to solve a series of crimes that are causing nightmares to leak into reality.`,
        seriesLogline: `A group of outcast librarians discovers that all fiction is real and must use their knowledge of stories to protect the world from literary villains who have escaped their books.`,
        themes: `This story explores the power of found family, the conflict between cynicism and hope, and the idea that stories have a life of their own.`,
        tone: `A whimsical urban fantasy with a noir-style mystery at its core. It's humorous and heartwarming, but with moments of genuine peril.`,
        archetype: `The Reluctant Hero: A character who is initially unwilling to accept their destiny but rises to the occasion when others are in need.`,
        motivation: `To prove their worth to a world that has always underestimated them.`,
        flaws: `A stubborn pride that makes it difficult to ask for help, and a deep-seated fear of spiders.`,
        backstory: `Once a promising scholar, they were exiled after a magical experiment went wrong, forcing them to live a quiet life in obscurity until the story begins.`,
        openingImage: `A single, glowing book sits on a dusty, forgotten shelf in a vast, dark library.`,
        catalyst: `A character from a famous novel appears in the real world, pleading for help.`,
        finale: `The heroes use their combined knowledge of literary tropes to outsmart the main villain, trapping them in a paradox from which they cannot escape.`
    };
    const responseText = mockResponses[key] || `[This is a simulated AI suggestion for the '${getFieldLabel(key, project.type)}' field.]`;

    // Simulate a network delay of 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));

    return responseText;
}

function createSection(title) {
    const section = document.createElement('div');
    section.classList.add('form-section');
    section.id = `section-${title.replace(/\s+/g, '-').toLowerCase()}`; // e.g., 'section-core-concepts'
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
        updateSaveIndicator('saving');
        debouncedSave();
    });

    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.textContent = 'Generate';
    generateButton.classList.add('generate-button');
    generateButton.addEventListener('click', async () => {
        generateButton.disabled = true;
        generateButton.textContent = 'Generating...';
        generateButton.setAttribute('data-loading', 'true'); // For testability

        try {
            const generatedText = await callAIService(key, project);
            input.value = generatedText;
            parent[key] = generatedText;
            saveAndIndicate();
        } catch (error) {
            console.error("AI service call failed:", error);
            // Optionally, show an error to the user
        } finally {
            generateButton.disabled = false;
            generateButton.textContent = 'Generate';
            generateButton.removeAttribute('data-loading'); // For testability
        }
    });

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

    // --- Create Tab Navigation ---
    const tabContainer = document.createElement('div');
    tabContainer.classList.add('tab-container');

    const tabs = ['Core Concepts', 'Characters', 'Structure'];
    tabs.forEach(tabName => {
        const tabButton = document.createElement('button');
        tabButton.textContent = tabName;
        tabButton.classList.add('tab-button');
        tabButton.dataset.tab = tabName.replace(/\s+/g, '-').toLowerCase(); // e.g., 'core-concepts'
        tabContainer.appendChild(tabButton);
    });

    detailView.appendChild(tabContainer);

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

    // --- Tab Switching Logic ---
    const tabButtons = tabContainer.querySelectorAll('.tab-button');

    function switchTab(activeTab) {
        tabButtons.forEach(button => {
            const tab = button.dataset.tab;
            const section = document.getElementById(`section-${tab}`);
            if (tab === activeTab) {
                button.classList.add('active');
                if (section) section.style.display = 'block';
            } else {
                button.classList.remove('active');
                if (section) section.style.display = 'none';
            }
        });
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent form submission
            switchTab(button.dataset.tab);
        });
    });

    // Set the default tab to be active
    switchTab('core-concepts');

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete Project';
    deleteButton.classList.add('delete-button');
    deleteButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            projects = projects.filter(p => p.id !== projectId);
            saveAndIndicate();

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
            saveAndIndicate();
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
        saveAndIndicate();
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
let saveTimeout; // For the indicator

function updateSaveIndicator(status) {
    const indicator = document.getElementById('save-indicator');
    if (status === 'saving') {
        indicator.textContent = 'Saving...';
        indicator.classList.add('show');
    } else if (status === 'saved') {
        indicator.textContent = 'Saved';
        indicator.classList.add('show');
        // Hide it after a delay
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    }
}

function saveProjects() {
    localStorage.setItem('cyberfilm-projects', JSON.stringify(projects));
}

const debouncedSave = debounce(() => {
    saveProjects();
    updateSaveIndicator('saved');
}, 1000); // 1-second debounce delay

function saveAndIndicate() {
    updateSaveIndicator('saving');
    saveProjects();
    // Use a short timeout to make "Saving..." visible before it flips to "Saved"
    setTimeout(() => {
        updateSaveIndicator('saved');
    }, 100);
}

function loadProjects() {
    const savedProjects = localStorage.getItem('cyberfilm-projects');
    if (savedProjects) {
        projects = JSON.parse(savedProjects);
    } else {
        projects = []; // Initialize if nothing is saved
    }
}