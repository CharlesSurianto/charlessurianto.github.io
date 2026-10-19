const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const loadProjects = () =>
    fetch("projects/projects.json")
        .then(response => {
            if (!response.ok) {
                throw new Error("Unable to load project metadata.");
            }

            return response.json();
        })
        .then(data => data.projects || []);

// Assets live alongside each project's data, named after its folder
// (e.g. "projects/m8-minima/m8-minima.jpg"), unless overridden in projects.json
// with "image": a bare file name is looked up in that folder, while a URL or any
// path containing "/" (e.g. "./projects/x/images/top.jpg") is used as-is.
const projectImagePath = (project, folder) => {
    if (project.image === false) {
        return null;
    }

    if (project.image?.includes("/")) {
        return project.image;
    }

    return `projects/${folder}/${project.image || `${folder}.jpg`}`;
};

const projectImageMarkup = (project, folder) => {
    const imageAlt = escapeHtml(project.imageAlt || project.title);
    const imagePath = projectImagePath(project, folder);

    return imagePath
        ? `<img src="${escapeHtml(imagePath)}" alt="${imageAlt}" loading="lazy">`
        : `<div class="image-placeholder" role="img" aria-label="${imageAlt}"></div>`;
};

const slideTemplate = (project, index) => {
    const folder = escapeHtml(project.folder);
    const title = escapeHtml(project.title);
    const date = escapeHtml(project.date);
    const repo = project.repo ? escapeHtml(project.repo) : "";

    const repoLink = repo
        ? `<a href="${repo}" target="_blank" rel="noopener noreferrer"><i class="fa fa-github" aria-hidden="true"></i> GitHub</a>`
        : "";

    return `
        <article class="project-slide" data-index="${index}" data-folder="${folder}">
            <div class="project-slide-media">
                ${projectImageMarkup(project, folder)}
            </div>

            <div class="project-slide-info">
                <h3>${title}</h3>
                <span class="project-slide-date">${date}</span>

                <div class="project-slide-links">
                    ${repoLink}
                    <a href="viewer.html?project=${folder}"><i class="fa fa-eye" aria-hidden="true"></i> Viewer</a>
                </div>
            </div>
        </article>
    `;
};

const dotTemplate = (project, index) => {
    const title = escapeHtml(project.title);
    const date = escapeHtml(project.date);

    return `
        <button type="button" class="timeline-dot" data-index="${index}" aria-label="${title} — ${date}">
            <span class="timeline-dot-marker"></span>
            <span class="timeline-dot-label">${date}</span>
        </button>
    `;
};

const renderSlider = projects => {
    const slider = document.querySelector("#project-slider");
    const timeline = document.querySelector(".project-timeline");
    const nav = document.querySelector(".project-slider-nav");
    const dotsWrap = document.querySelector("#timeline-dots");
    const fill = document.querySelector("#timeline-fill");
    const prevBtn = document.querySelector(".slider-prev");
    const nextBtn = document.querySelector(".slider-next");

    if (!projects.length) {
        slider.innerHTML = `<p class="project-slide-empty">More projects coming soon.</p>`;
        timeline.style.display = "none";
        nav.style.display = "none";

        return;
    }

    slider.innerHTML = projects.map(slideTemplate).join("");
    dotsWrap.innerHTML = projects.map(dotTemplate).join("");

    const slides = [...slider.children];
    const dots = [...dotsWrap.children];

    const syncNavHeight = () => {
        const media = slider.querySelector(".project-slide-media");

        if (media) {
            nav.style.height = `${media.offsetHeight}px`;
        }
    };

    let activeIndex = 0;

    // The line spans the first to last marker, and the fill is anchored at the
    // last (oldest) one and runs back to the active marker. Measured rather than
    // computed from the index, since the dots are spaced by their label widths,
    // not evenly along the track.
    const track = fill.parentElement;
    const markerCenter = dot => {
        const marker = dot.querySelector(".timeline-dot-marker").getBoundingClientRect();
        return marker.left + marker.width / 2;
    };

    const syncTimeline = () => {
        const bounds = track.getBoundingClientRect();
        const first = markerCenter(dots[0]);
        const last = markerCenter(dots[dots.length - 1]);

        track.style.setProperty("--line-start", `${first - bounds.left}px`);
        track.style.setProperty("--line-end", `${bounds.right - last}px`);
        fill.style.width = `${Math.max(0, last - markerCenter(dots[activeIndex]))}px`;
    };

    const setActive = index => {
        activeIndex = index;

        dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
        syncTimeline();
    };

    syncNavHeight();
    window.addEventListener("resize", () => {
        syncNavHeight();
        syncTimeline();
    });
    document.fonts?.ready.then(syncTimeline);

    const goTo = index => {
        const clamped = Math.max(0, Math.min(projects.length - 1, index));
        slides[clamped].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    };

    dots.forEach((dot, i) => dot.addEventListener("click", () => goTo(i)));
    prevBtn.addEventListener("click", () => goTo(activeIndex - 1));
    nextBtn.addEventListener("click", () => goTo(activeIndex + 1));

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                setActive(Number(entry.target.dataset.index));
            }
        });
    }, { root: slider, threshold: [0.6] });

    slides.forEach(slide => observer.observe(slide));

    // Restore whichever project the visitor was viewing before following a
    // "Back to all projects" link, so the slider doesn't reset to the newest.
    const restoreFolder = new URLSearchParams(window.location.search).get("project");
    const restoreIndex = restoreFolder ? projects.findIndex(project => project.folder === restoreFolder) : -1;
    const initialIndex = restoreIndex >= 0 ? restoreIndex : 0;

    if (restoreFolder) {
        if (initialIndex > 0) {
            slides[initialIndex].scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
        }

        if (window.history?.replaceState) {
            window.history.replaceState(null, "", `${window.location.pathname}#projects`);
        }
    }

    setActive(initialIndex);
};

const initHome = () => {
    if (!document.querySelector("#project-slider")) {
        return;
    }

    loadProjects()
        .then(projects => projects.filter(project => project.shown !== false))
        .then(renderSlider)
        .catch(error => console.error(error));
};

const renderViewer = project => {
    document.title = `${project.title} — Charles Surianto`;

    const backLink = document.querySelector(".viewer-back");

    if (backLink) {
        backLink.href = `index.html?project=${encodeURIComponent(project.folder)}#projects`;
    }

    document.querySelector("#viewer-date").textContent = project.date;
    document.querySelector("#viewer-title").textContent = project.title;
    document.querySelector("#viewer-description").textContent = project.description;

    document.querySelector("#viewer-tags").innerHTML = (project.tags || [])
        .map(tag => `<li>${escapeHtml(tag)}</li>`)
        .join("");

    const repoLink = document.querySelector("#viewer-repo-link");

    if (project.repo) {
        repoLink.href = project.repo;
    } else {
        repoLink.remove();
    }

    const embed = document.querySelector("#viewer-embed");

    if (project.viewerSrc) {
        const frame = document.createElement("iframe");

        frame.className = "viewer-frame";
        frame.src = project.viewerSrc;
        frame.title = `${project.title} PCB viewer`;
        frame.scrolling = "no";
        frame.allowFullscreen = true;

        // Altium's viewer scrolls the parent page when it loads; undo that.
        frame.addEventListener("load", () => window.scrollTo(0, 0));

        embed.replaceWith(frame);
    } else {
        embed.closest(".viewer-embed-section").remove();
    }
};

const initViewer = () => {
    const root = document.querySelector("#viewer-root");

    if (!root) {
        return;
    }

    const folder = new URLSearchParams(window.location.search).get("project");

    loadProjects()
        .then(projects => {
            const project = projects.find(item => item.folder === folder);

            if (!project) {
                throw new Error(`No project found for "${folder}".`);
            }

            renderViewer(project);
        })
        .catch(error => {
            console.error(error);

            root.innerHTML = `
                <section class="viewer-hero">
                    <a href="index.html#projects" class="viewer-back">
                        <i class="fa fa-arrow-left" aria-hidden="true"></i> Back to all projects
                    </a>
                    <h1>Project not found</h1>
                </section>
            `;
        });
};

const includePartial = (selector, url) => {
    const target = document.querySelector(selector);

    if (!target) {
        return;
    }

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Unable to load ${url}.`);
            }

            return response.text();
        })
        .then(html => {
            target.outerHTML = html;
        })
        .catch(error => console.error(error));
};

// The toggle lives in the header partial, which loads after this script runs,
// so listen on the document rather than binding to the button directly.
const initThemeToggle = () => {
    document.addEventListener("click", event => {
        if (!event.target.closest(".theme-toggle")) {
            return;
        }

        const root = document.documentElement;
        const isDark = root.dataset.theme
            ? root.dataset.theme === "dark"
            : window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = isDark ? "light" : "dark";

        root.dataset.theme = theme;

        try {
            localStorage.setItem("theme", theme);
        } catch (error) {
            // Storage blocked (e.g. private mode); the choice just won't persist.
        }
    });
};

initThemeToggle();

includePartial("#site-header", "header.html");
includePartial("#site-footer", "footer.html");

initHome();
initViewer();
