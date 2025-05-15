/**
 * @param {object} topics 
 * @param {string[]} context 
 */
async function createTopics(topics, context) {
    if (typeof topics !== 'string' && typeof topics !== 'object') topics = String(topics)
    else if (Array.isArray(topics)) topics = '- ' + topics.join('\n- ')

    const targetBar = topicTree.querySelector(`.bar .topics[data-context="${context.slice(0, -1).join(contextSeperator)}"]`).parentNode
    targetBar.querySelector(`.creator button[name="${typeof topics === 'string' ? 'file' : 'folder'}"]`).dispatchEvent(new Event('click'))
    const inputName = targetBar.querySelector('.creator input')
    inputName.value = context[context.length - 1]
    inputName.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
    }))
    if (typeof topics === 'string') {
        const editor = getEditor(context.join(contextSeperator))
        editor.querySelector('.textarea').innerHTML = wrapLinks(topics)
        return
    }

    for (let [key, value] of Object.entries(topics))
        createTopics(value, [...context, key])
}
function modifyTopic(value, context, append = true) {
    if (!value.trim()) return
    for (let depth = 0; depth < context.length; depth++)
        getParentButton(context.slice(0, depth + 1)).dispatchEvent(new Event('click'))
    const textarea = getEditor(context.join(contextSeperator)).querySelector('.textarea')
    value = `<details open>
<summary>${context.join(' -> ')}</summary>

${value}
</details>`
    if (append) textarea.innerHTML += '<br>' + wrapLinks(value)
    else textarea.innerHTML = wrapLinks(value)
}
/**
 * @param {object} oldTopics 
 * @param {object} newTopics 
 * @param {string[]} context 
 * @param {boolean} append 
 */
function implementChanges(oldTopics, newTopics, context, append) {
    for (let [key, value] of Object.entries(newTopics)) {
        const newContext = [...context, key]
        if (typeof value !== 'string' && typeof value !== 'object') value = String(value)
        else if (Array.isArray(value)) value = '- ' + value.join('\n- ')

        if (!oldTopics.hasOwnProperty(key)) {
            for (let depth = 0; depth < context.length; depth++)
                getParentButton(context.slice(0, depth + 1)).dispatchEvent(new Event('click'))
            createTopics(value, newContext)
        }
        else if (typeof value === 'object') implementChanges(oldTopics[key], value, newContext, append)
        else if (typeof value === 'string') modifyTopic(value, newContext, append)
        else throw Error("Ka baat kr rha hai trainer.js/implementChanges()")
    }
}
/**
 * @param {string} url 
 * @param {string[]} context 
 * @param {{images:boolean, limit:number, append:boolean}} options 
 * @param {Function|null} exit 
 */
async function trainURL(url, context, options, exit) {
    let oldTopics = layout
    for (let topic of context)
        oldTopics = oldTopics[topic]
    const response = await fetch(server + "/trainer", {
        method: "POST",
        headers: {
            "Content-Type": "application/json;charset=UTF-8"
        },
        body: JSON.stringify({
            type: 'url',
            source: /\b.+:\/\//.test(url) ? url : "https://" + url,
            topics: oldTopics,
            options,
            context
        })
    }).catch((err) => {
        if (exit) exit()
        showError("Failed to fetch " + url, 5 * 1000)
        console.error(err)
    })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    const references = decoder.decode((await reader.read()).value)
    if (references.endsWith('ERROR')) {
        showError("Failed to fetch " + url, 5 * 1000)
        if (exit) exit()
        return
    }
    while (!(chunk = await reader.read()).done) {
        const data = decoder.decode(chunk.value)
        if (data.endsWith('ERROR')) {
            showError("Failed to fetch " + url, 5 * 1000)
            break
        }
        const newTopics = JSON.parse(data)
        if (newTopics) implementChanges(oldTopics, newTopics, context, options.append)
    }
    closeEditor()
    if (exit) exit()
    showError("Trained from: " + references.replaceAll(';', ', '), 10 * 1000, 'green')
}
/**
 * @param {string[]} context 
 * @param {HTMLDivElement} bar 
 */
function addAITrainerButton(bar, context) {
    const trianerIcon = document.createElement('div')
    trianerIcon.className = 'AITrain'
    trianerIcon.style.opacity = 0
    const trainerButton = document.createElement('button')
    trainerButton.textContent = '✨'
    trainerButton.type = 'button'
    trainerButton.title = "Auto-trainer"
    trainerButton.addEventListener("click", () => {
        createButtonWindow(trainerButton,
            `<div class="trainer-window">
<lable style="font-size:small">images<input type="checkbox" title="uncheck to discard images" name="images" checked></lable>
<lable style="font-size:small">replace<input type="checkbox" title="repalce existing text with new data" name="replace"></lable>
        <button title="scrap a website">url</button>
        <input type="file" accept="application/pdf" id="pdf-input" style="display:none">\
        <label for="pdf-input" title="extract markdown from pdf" id="pdf">pdf</lable>
</div>`,
            inputTrainWindow, null, 1, null, context.join(contextSeperator));
    });
    trianerIcon.appendChild(trainerButton)
    bar.appendChild(trianerIcon)
}
/**
 * @param {HTMLElement} window
 * @param {Event} event
 * @param {Function} exit
 * @returns {void}
 */
function inputTrainWindow(window, event, exit) {
    function removeLoader() {
        loading(false, 1)
        stopFetching = false
    }
    if (event.target.textContent === "url") {
        const images = window.querySelector('[name="images"]').checked
        const replaceData = window.querySelector('[name="replace"]').checked
        window.innerHTML = `<input type="url" id="site" placeholder="example.com" class="window-input">
        <input type="number" min="1" placeholder="1" class="window-input small">`;
        const input = window.querySelector("#site");
        const limitInput = window.querySelector('.window-input.small')
        limitInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            input.focus()
        })
        input.focus();
        input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            loading(true, 1)
            if (replaceData) stopFetching = true
            trainURL(input.value, window.dataset.info ? window.dataset.info.split(contextSeperator) : [], { images, limit: parseInt(limitInput.value) || 1, append: !replaceData }, removeLoader);
            exit();
        });
    }

    if (event.target.textContent == "pdf") {
        const images = window.querySelector('[name="images"]').checked
        const replaceData = window.querySelector('[name="replace"]').checked
        window.querySelector("#pdf-input").addEventListener("change", (event) => {
            if (event.target.files[0].size > FILE_SIZE_LIMIT) {
                showError("Exceeded max allowed size: 10MB", 5000);
                return;
            }
            textarea.appendChild(loaderLayer);
            textarea.contentEditable = false;
            extractPdf(textarea, event.target.files[0], removeLoader, images);
            exit();
        });
    }
}
