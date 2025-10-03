const movies = [
    { title: "Movie 1", description: "This is the first movie." },
    { title: "Movie 2", description: "This is the second movie." },
    { title: "Movie 3", description: "This is the third movie." }
];

document.addEventListener("DOMContentLoaded", () => {
    const movieContainer = document.getElementById("movie-container");

    movies.forEach(movie => {
        const movieElement = document.createElement("div");
        movieElement.classList.add("movie");

        const title = document.createElement("h2");
        title.textContent = movie.title;

        const description = document.createElement("p");
        description.textContent = movie.description;

        movieElement.appendChild(title);
        movieElement.appendChild(description);

        movieContainer.appendChild(movieElement);
    });
});