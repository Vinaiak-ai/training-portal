/**
 * @callback WindowClickCallback
 * @param {HTMLDivElement} window
 * @param {Event} event
 * @param {Function} exit to delete layer and window.
 */
/**
 * Addds a layer and then an window. The complete element get deleted when somewhere except window is clicked
 * @param {HTMLElement} target relative to which window will be created.
 * @param {string} html to be shown inside window.
 * @param {WindowClickCallback} callback to be called onclick.
 * @param {Function?} finalize to be callback when window deletes.
 * @param {number?} dx horizontal offset target.
 * @param {number?} dy verticle offset from target.
 * @param {string?} info data to stored in window element.
 * @returns {HTMLDivElement} reference to added window's layer
 */
function createButtonWindow(target, html, callback, finalize, dx, dy, info) {
    dx = dx || 0;
    dy = dy || 0;
    const window = document.createElement("div");
    window.className = "window";
    window.dataset.info = info;
    window.innerHTML = html;
    const { x, y, width, height } = target.getBoundingClientRect();
    window.style.left = x + width * dx + "px";
    window.style.top = y + height * dy + "px";
    window.addEventListener("click", (event) => {
        callback(window, event, () => {
            document.body.removeChild(layer);
        });
    });
    const layer = document.createElement("div");
    layer.appendChild(window);
    layer.className = "layer";
    layer.addEventListener("click", (event) => {
        if (event.target == layer) {
            document.body.removeChild(layer);
            if (finalize) finalize(window, event);
        }
    });
    document.body.appendChild(layer);
    return layer;
}
/**
 * @param {HTMLElement} target in which result is to be appended
 * @param {string} url
 * @param {Function} callback always gets called request is completed, even with error.
 * @param {boolean} images 
 * @returns {void}
 */
function scrapURL(target, url, callback, images) {
    fetch(server + "/scrap/site", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            url: /\b.+:\/\//.test(url) ? url : "https://" + url,
            images: images ? 'true' : ''
        }),
    })
        .then((response) => {
            if (response.status != 200) {
                showError("Failed to fetch " + url, 5000);
                if (callback) callback();
                return;
            }
            response
                .json()
                .then((pages) => target.innerHTML += '<br><br>' + wrapLinks(Object.values(pages)[0]))
                .finally(() => {
                    if (callback) callback();
                });
        })
        .catch(() => {
            if (callback) callback();
        });
}
/**
 * @param {HTMLElement} target in which result is to be appended.
 * @param {File} pdf
 * @param {Function} callback always gets called request is completed, even with error.
 * @param {boolean} images 
 * @returns {void}
 */
function extractPdf(target, pdf, callback, images) {
    const req = new FormData();
    req.append("file", pdf);
    req.append("images", images ? true : '')

    fetch(server + "/scrap/pdf", {
        method: "POST",
        body: req,
    })
        .then((response) => {
            if (response.status != 200) {
                showError(pdf.name + " has invalid format", 5000);
                if (callback) callback();
                return;
            }
            response
                .text()
                .then(async (markdown) => {
                    const domParser = new DOMParser();
                    const mdDocument = domParser.parseFromString(markdown, "text/html");
                    for (const img of mdDocument.querySelectorAll("img")) {
                        img.className = "media extract image";
                        const response = await fetch(img.src);
                        const imgBlob = await response.blob();
                        files[fileNo] = new File(
                            [imgBlob],
                            pdf.name.split(".")[0] + (img.alt || "") + ".png",
                            { type: imgBlob.type },
                        );
                        img.dataset.link = fileNo++;
                    }
                    target.innerHTML += wrapLinks(mdDocument.body.innerHTML)
                })
                .finally(() => {
                    if (callback) callback();
                });
        })
        .catch(() => {
            if (callback) callback();
        });
}
/**
 * @param {HTMLElement} window
 * @param {Event} event
 * @param {Function} exit
 * @returns {void}
 */
function inputScrapWindow(window, event, exit) {
    const loader = document.createElement("div");
    loader.innerHTML = `<div class="loader"></div>`;
    loader.className = "loader-layer";
    function removeLoader() {
        textarea
            .querySelector(".loader-layer")
            .parentNode.removeChild(textarea.querySelector(".loader-layer"));
        openMarkdown(textarea.parentNode);
        textarea.contentEditable = true;
    }
    const images = window.querySelector('#images').checked
    const textarea = getEditor(window.dataset.info).querySelector(".textarea");
    if (event.target.textContent == "url") {
        window.innerHTML = `<input type="url" id="site" placeholder="example.com" class="window-input">`;
        const input = window.querySelector("#site");
        input.focus();
        input.addEventListener("keydown", (event) => {
            if (event.key != "Enter") return;
            textarea.appendChild(loader);
            textarea.contentEditable = false
            event.preventDefault();
            scrapURL(textarea, input.value, removeLoader, images);
            exit();
        });
    }

    if (event.target.textContent == "pdf") {
        window.querySelector("#pdf-input").addEventListener("change", (event) => {
            if (event.target.files[0].size > FILE_SIZE_LIMIT) {
                showError("Exceeded max allowed size: 10MB", 5000);
                return;
            }
            textarea.appendChild(loader);
            textarea.contentEditable = false;
            extractPdf(textarea, event.target.files[0], removeLoader, images);
            exit();
        });
    }
}
