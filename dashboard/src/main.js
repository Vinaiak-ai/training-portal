const server = "https://723lf5kroxlmnl6cyadfzlmqmq0rutsi.lambda-url.ap-south-1.on.aws";
const contextSeperator = '$'
const xhr = new XMLHttpRequest();
xhr.withCredentials = true
const topicTree = document.getElementById("topic-tree");
const fileInputSvg =
    '<svg><path fill="currentColor" fill-rule="evenodd" d="M9 7a5 5 0 0 1 10 0v8a7 7 0 1 1-14 0V9a1 1 0 0 1 2 0v6a5 5 0 0 0 10 0V7a3 3 0 1 0-6 0v8a1 1 0 1 0 2 0V9a1 1 0 1 1 2 0v6a3 3 0 1 1-6 0z" clip-rule="evenodd"></path></svg>';
const FILE_SIZE_LIMIT = 10 * 1024 * 1024;
let layout,
    hasFiled = false, stopFetching = false;
let activeEditor,
    activeEditorInitialHTML,
    selectedButton,
    files = {},
    fileNo = 0;
const operationState = {
    modify: "modified",
    create: "created",
    delete: "deleted",
    rename: "renamed",
};
let lockid = null
/**
 * @param {boolean} type 
 * @param {number} [_lockid=0] to only remove loader when called with this ID.
 */
function loading(type, _lockid = null) {
    if (type === false && lockid === _lockid) {
        document.getElementById("loading").style.display = "none";
        lockid = null
    }
    else if (lockid === null) {
        document.getElementById("loading").style.display = "block";
        lockid = _lockid
    }
}
loading();
fetch(server + "/data/layout", {
    credentials: 'include'
}).then(response => {
    if (response.status !== 200) window.location.href = '/login'
    else return response.json()
}).then(_layout => {
    loading(false);
    layout = _layout;
    document.getElementById("workspace").style.display = "block";
    createOptions([]);
}).catch(_ => {
    window.location.href = '/login'
});
document.addEventListener("keydown", (event) => {
    if (
        document.getElementById("loading").style.display !== "none" &&
        !event.ctrlKey
    ) {
        event.preventDefault();
        return;
    }
    switch (event.key) {
        case "Escape":
            document.getElementById("workspace").dispatchEvent(new Event("click"));
            if (activeEditor && activeEditor.style.display !== "none") closeEditor();
            else if (document.querySelector("#notice").style.display !== "none")
                document
                    .querySelector("#notice .close")
                    .dispatchEvent(new Event("click"));
            break;
        case "Delete":
            if (
                activeEditor &&
                activeEditor.style.display === "block" &&
                activeEditor.querySelector(".markdown").style.display === "none"
            )
                break;
            deleteTopic();
            loading(false);
            break;
        case "F2":
            if (document.getElementById("notice").style.display !== "none") return;
            closeEditor();
            let nameInput = document.createElement("input");
            nameInput.placeholder = "new name";
            nameInput.value = selectedButton.textContent;
            selectedButton.textContent = "";
            nameInput.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") return;
                const newName = nameInput ? nameInput.value.trim() : undefined;
                if (nameInput && newName) {
                    event.preventDefault();
                    if (
                        nameInput.parentNode.dataset.topic !== newName &&
                        isValidTopicName(nameInput.parentNode.parentNode.children, newName)
                    ) {
                        nameInput.parentNode.classList.add("renamed");
                        nameInput.parentNode.textContent = newName;
                    }
                }
            });
            selectedButton.appendChild(nameInput);
            nameInput.focus();
            break;
        case "F5":
            event.preventDefault();
            if (!activeEditor) break;
            if (activeEditor.querySelector(".markdown").style.display === "none")
                openMarkdown();
            else activeEditor.querySelector(".markdown").style.display = "none";
    }
});
document.getElementById("workspace").addEventListener(
    "click",
    (event) => {
        if (document.getElementById("loading").style.display !== "none") {
            event.preventDefault();
            return;
        }
        const activeInputFileName = document.querySelector(".bar .creator input");
        if (
            activeInputFileName &&
            (event.target.dataset.context === undefined ||
                event.target.dataset.context !== activeInputFileName.dataset.context)
        ) {
            const topicBar =
                activeInputFileName.parentNode.parentNode.querySelector(".topics");
            topicBar.parentNode.removeChild(activeInputFileName.parentNode);
            addCreateTopicButton(topicBar.parentNode);
            return;
        }
        const activeInputFileRename = document.querySelector(".bar .topics .topic input");
        if (
            activeInputFileRename &&
            event.target !== activeInputFileRename.parentNode &&
            event.target !== activeInputFileRename
        ) {
            activeInputFileRename.parentNode.classList.remove("renamed");
            activeInputFileRename.parentNode.textContent =
                activeInputFileRename.parentNode.dataset.topic;
        }
    },
    true,
);
document.querySelector("#save-server").addEventListener("click", () => {
    document.getElementById("topic-tree-hider").style.display = "block";
    if (document.querySelector("#notice").style.display === "block") {
        if (!activeEditor || activeEditor.style.display === "none")
            executeTasks(detectTasks()).then((fails) => {
                if (fails)
                    showError(
                        "Failed to save " +
                        fails +
                        " changes. But rest the changes sucessfully made",
                        2000,
                    );
            });
        else closeEditor();
        return;
    }
    closeEditor();
    const taskBoard = document.querySelector("#notice .tasks");
    const tasks = detectTasks();
    document.querySelector("#notice").style.display = "block";
    taskBoard.textContent = "";
    for (let task of tasks)
        taskBoard.appendChild(
            createTaskLine(
                task,
                getEditor(task.data.context) &&
                    task.operation !== "rename" &&
                    task.operation !== "delete"
                    ? () => {
                        launchEditor(task.data.context.split(contextSeperator), task.operation);
                    }
                    : () => {
                        navigate(task.data.context);
                    },
            ),
        );
});
document.querySelector("#notice .close").addEventListener("click", () => {
    document.querySelector("#notice").style.display = "none";
    document.getElementById("topic-tree-hider").style.display = "none";
});

function createButton(context) {
    let button = document.createElement("button");
    button.className = "topic";
    button.dataset.topic = context[context.length - 1];
    button.innerText = context[context.length - 1];
    button.addEventListener("click", (event) => {
        if (button.querySelector("input")) return;
        if (button.classList.contains("deleted")) {
            button.classList.remove("deleted");
        } else createOptions(context);
        const buttonBrothers = document.querySelector(
            `.bar .topics[data-context="${context.slice(0, -1).join(contextSeperator)}"]`,
        ).children;
        for (let brotherButton of buttonBrothers)
            brotherButton.classList.remove("selected");
        button.classList.add("selected");
        selectedButton = button;
    });
    button.addEventListener('contextmenu', (topicEvent) => {
        topicEvent.preventDefault()
        const layer = createButtonWindow(button, `<button style="background-color:black">Delete</button><br>
            <button style="background-color:black">Rename</button>`, (window, windowEvent, exit) => {
            selectedButton = button
            button.classList.add("selected");
            if (windowEvent.target.textContent === 'Delete') {
                deleteTopic()
                loading(false);
            }
            if (windowEvent.target.textContent === 'Rename')
                document.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "F2",
                    code: "F2",
                    keyCode: 113,
                    which: 113,
                    bubbles: true,
                    cancelable: true
                }))
            exit()
        }, null, 1, -1)
        layer.querySelector('.window').style.backgroundColor = 'black'
    })
    return button;
}
function createOptions(context) {
    let releventLayout = layout;
    for (let topic of context) releventLayout = releventLayout[topic];
    if (releventLayout === null) {
        closeEditor();
        launchEditor(context, "create");
        return;
    }
    if (typeof releventLayout === "string" || Array.isArray(releventLayout)) {
        closeEditor();
        launchEditor(context, "modify");
        return;
    }
    const existingTopicBar = document.querySelector(
        `.bar .topics[data-context="${context.slice(0, -1).join(contextSeperator)}"]`,
    );
    if (existingTopicBar) {
        const parentIndex = Array.from(topicTree.children).indexOf(existingTopicBar.parentNode);
        for (let i = parentIndex + 1; i < topicTree.children.length; i++)
            topicTree.children[i].style.display = "none";
    }
    const thisBar = document.querySelector(
        `.bar .topics[data-context="${context.join(contextSeperator)}"]`,
    );
    if (thisBar) {
        thisBar.parentNode.style.display = "block";
        return;
    }
    let topicBar = document.createElement("div");
    topicBar.className = "topics";
    topicBar.dataset.context = context.join(contextSeperator);
    let releventTopics = Object.keys(releventLayout);
    for (let releventTopic of releventTopics) {
        if (releventTopic === "examples") continue;
        topicBar.appendChild(
            createButton([
                ...context.filter((element) => element !== ""),
                releventTopic,
            ]),
        );
    }
    let bar = document.createElement("div");
    bar.className = "bar";
    addCreateTopicButton(bar);
    addAITrainerButton(bar, context);
    bar.appendChild(topicBar);
    let blur = document.createElement("div");
    blur.className = "blur left";
    let blur2 = document.createElement("div");
    blur2.className = "blur right";
    bar.appendChild(blur);
    bar.appendChild(blur2);
    topicTree.appendChild(bar);
}
function launchEditor(context, operation) {
    const workspace = document.getElementById("workspace");
    let editor = getEditor(context.join(contextSeperator));
    if (!editor) {
        editor = createTextEditor(context, operation);
        workspace.appendChild(editor);
    } else activeEditorInitialHTML = editor.querySelector(".textarea").innerHTML;
    openEditor(editor);
    workspace.scrollTo({
        top: workspace.scrollHeight,
        behavior: "smooth",
    });
    return editor
}
/**
 * @param {string[]} context 
 * @param {string} operation 
 */
function createTextEditor(context, operation) {
    loading();
    let editor = document.createElement("div");
    editor.className = "editor text";
    editor.style.display = "none";
    editor.dataset.context = context.join(contextSeperator);
    editor.dataset.operation = operation;
    editor.innerHTML = `<div class="markdown" style="display:none"></div>\
    <div class="textarea" contentEditable="true"></div>`;
    editor.querySelector(".textarea").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            document.execCommand("insertLineBreak");
        }
    });
    editor.querySelector(".textarea").addEventListener("paste", function(event) {
        const data = new DOMParser().parseFromString(
            event.clipboardData.getData("text/html"),
            "text/html",
        );
        if (data.querySelector("img")) return;
        event.preventDefault();
        let text = event.clipboardData.getData("text");
        text = text.replace(/\r\n|\r|\n/g, "<br>").replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
            .replace(/ {2,}/g, match => '&nbsp;'.repeat(match.length))
        document.execCommand("insertHTML", false, text);
    });
    editor.querySelector(".markdown").addEventListener("click", (event) => {
        if (event.target.tagName === "A" || event.target.tagName === "IMG" || event.target.tagName === 'SUMMARY') return;
        editor.querySelector(".markdown").style.display = "none";
        focus(editor.querySelector(".textarea"));
    });
    editor.querySelector(".textarea").addEventListener("click", textareaOnclick);
    editor.querySelector(".markdown").addEventListener("click", textareaOnclick);
    addEditorButtons(editor);
    if (operation === "create") {
        loading(false);
        return editor;
    }
    if (!stopFetching)
        fetch(server + "/data/fetch", {
            method: "POST",
            credentials: 'include',
            headers: {
                "Content-Type": "application/json;charset=UTF-8"
            },
            body: JSON.stringify({
                context
            })
        }).then(response => response.text()).then(text => {
            const textarea = editor.querySelector(".textarea")
            textarea.innerHTML = wrapLinks(text) + textarea.innerHTML
            activeEditorInitialHTML = textarea.innerHTML
            editor.dataset.links = getLinks(textarea, true).join(" ");
            focus(textarea);
            openMarkdown(editor);
            loading(false);
        }).catch(() => {
            loading(false);
            editor.parentNode.removeChild(editor);
            activeEditor = null;
            showError("Unable to connect, please check your network and try again");
        })
    return editor;
}
function addEditorButtons(editor) {
    let closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.className = "close";
    closeButton.addEventListener("click", closeEditor);
    editor.append(closeButton);
    let editorHeading = document.createElement("h5");
    editorHeading.className = "heading";
    editorHeading.textContent =
        editor.dataset.operation +
        ": " +
        editor.dataset.context.split(contextSeperator).join(" \u2192 ");
    editorHeading.addEventListener("click", () => {
        openMarkdown(editor);
    });
    editor.prepend(editorHeading);
    let editorButtons = document.createElement("div");
    editorButtons.className = "buttons";
    editorButtons.innerHTML +=
        '<button class="restore" title="restore from server data">Restore</button>\
    <button class="extract" title="extract text from url or pdf">Extract</button>\
    <input type="file" id="file" style="display:none">\
    <label for="file" class="file-input">' +
        fileInputSvg +
        '</label>\
    <button class="delete" title="delete the file">Delete</button>';
    editorButtons.querySelector("#file").addEventListener("input", (event) => {
        if (event.target.files[0].size > FILE_SIZE_LIMIT) {
            showError("Exceeded max allowed size: 10MB", 5000)
            return
        }
        inputFiles(event, activeEditor.querySelector(".textarea"));
        if (activeEditor.querySelector(".markdown").style.display !== "none")
            openMarkdown();
    });
    editorButtons
        .querySelector("button.extract")
        .addEventListener("click", () => {
            createButtonWindow(
                editorButtons.querySelector("button.extract"),
                `<lable style="font-size:small">images<input type="checkbox" title="uncheck to discard images" id="images" checked></lable>
        <button title="scrap a website">url</button>
        <input type="file" accept="application/pdf" id="pdf-input" style="display:none">\
        <label for="pdf-input" title="extract markdown from pdf" id="pdf">pdf</lable>`,
                inputScrapWindow,
                null,
                null,
                -1,
                editor.dataset.context,
            );
        });
    editorButtons
        .querySelector("button.delete")
        .addEventListener("click", deleteTopic);
    editorButtons
        .querySelector("button.restore")
        .addEventListener("click", () => {
            const parentButton = getParentButton(editor.dataset.context);
            if (parentButton.classList.contains("created")) {
                showError("Nothing to restore from server", 3000)
                return;
            }
            editor.operation = "modify";
            parentButton.className =
                "topic" +
                (parentButton.classList.contains("renamed") ? " renamed" : "") +
                (parentButton.classList.contains("selected") ? " selected" : "");
            loading();
            xhr.open("POST", server + "/data/fetch", true);
            xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            xhr.withCredentials = true
            xhr.onload = () => {
                editor.querySelector(".textarea").innerHTML = wrapLinks(xhr.responseText)
                activeEditorInitialHTML = editor.querySelector(".textarea").innerHTML;
                loading(false);
                openMarkdown(editor);
            };
            xhr.send(
                JSON.stringify({ context: editor.dataset.context.split(contextSeperator) })
            );
        });
    editor.appendChild(editorButtons);
}
/**
 * @param {string | string[]} context 
 * @returns {HTMLButtonElement|null} topicButton
 */
function getParentButton(context) {
    if (typeof context === 'string')
        context = context.split(contextSeperator);
    else context = [...context]
    const topic = context.pop();
    return topicTree.querySelector(
        `.bar .topics[data-context="${context.join(contextSeperator)}"] button.topic[data-topic="${topic}"]`,
    );
}
/**
 * @param {string} context
 * @returns {HTMLElement | null} editor
 */
function getEditor(context) {
    const editor = document.querySelector(`.editor[data-context="${context}"]`);
    return editor
        ? editor.dataset.operation === "placeholder"
            ? null
            : editor
        : null;
}
function openEditor(editor) {
    if (editor.dataset.operation === "placeholder") return;
    editor.style.display = "block";
    activeEditor = editor;
    const textarea = editor.querySelector(".textarea");
    if (textarea.textContent) openMarkdown(editor);
    focus(textarea);
}
function closeEditor() {
    if (!activeEditor || activeEditor.style.display === "none") return;
    activeEditor.style.display = "none";
    const parentButton = getParentButton(activeEditor.dataset.context);
    if (
        document.querySelector("#notice").style.display !== "none" &&
        !(
            parentButton.classList.contains("modified") ||
            parentButton.classList.contains("deleted") ||
            parentButton.classList.contains("created")
        )
    ) {
        const parentTask = document.querySelector(
            `#notice .tasks .bar.task[data-context="${activeEditor.dataset.context}"]`,
        );
        animateRemove(parentTask, "vanish 0.4s ease 0.1s", 0.4);
    }
    if (
        activeEditor.querySelector(".textarea").innerHTML !==
        activeEditorInitialHTML &&
        !parentButton.classList.contains("created") &&
        !parentButton.classList.contains("deleted")
    ) {
        parentButton.classList.add("modified");
        const context = activeEditor.dataset.context.split(contextSeperator);
        context.pop()
        while (context.length) {
            getParentButton(context).classList.add("modified");
            context.pop()
        }
    }
}
function getDeletedContext(editors) {
    let deletedContexts = [];
    for (let editor of editors) {
        if (
            editor.dataset.operation !== "create" &&
            getParentButton(editor.dataset.context).classList.contains(
                operationState["delete"],
            )
        ) {
            const context = editor.dataset.context;
            let i = 0;
            for (; i < deletedContexts.length; i++) {
                if (deletedContexts[i].includes(context)) {
                    deletedContexts[i] = context;
                    break;
                }
            }
            if (
                deletedContexts.every((element) => !context.includes(element)) &&
                i === deletedContexts.length
            )
                deletedContexts.push(context);
        }
    }
    return deletedContexts;
}
function detectTasks() {
    const editors = document.querySelectorAll(".editor");
    const deletedContexts = getDeletedContext(editors);
    let tasks = [];
    let taskNumber = 1;
    for (let editor of editors) {
        const context = editor.dataset.context;
        const parentButton = getParentButton(context);
        if (!parentButton && editor.dataset.operation === "create") continue;
        if (
            !(
                deletedContexts.includes(context) ||
                deletedContexts.every((element) => !context.includes(element))
            )
        )
            continue;
        if (parentButton.classList.contains(operationState["delete"])) {
            tasks.push({
                taskNumber: taskNumber++,
                operation: "delete",
                route:
                    "/data/delete" +
                    (editor.dataset.operation === "placeholder" ? "?all=true" : ""),
                data: { context: context },
                created: [],
                deleted: editor.dataset.links ? editor.dataset.links.split(" ") : [],
            });
        } else if (
            editor.dataset.operation === "modify" &&
            parentButton.classList.contains(operationState["modify"])
        ) {
            tasks.push({
                taskNumber: taskNumber++,
                operation: "modify",
                route: "/data/modify",
                data: { context: context, data: editor.querySelector(".textarea") },
                ...detectFileChanges(editor),
            });
        } else if (
            editor.dataset.operation === "create" ||
            (editor.dataset.operation === "placeholder" &&
                parentButton.classList.contains(operationState["create"]))
        ) {
            tasks.push({
                taskNumber: taskNumber++,
                operation: "create",
                route: "/data/create",
                data: {
                    context: context,
                    data:
                        editor.dataset.operation === "create"
                            ? editor.querySelector(".textarea")
                            : undefined,
                },
                created:
                    editor.dataset.operation === "create"
                        ? Array.from(
                            new Set(
                                getLinks(editor.querySelector(".textarea"), false, true),
                            ),
                        )
                        : [],
                deleted: [],
            });
        }
    }
    const renames = document.querySelectorAll(".bar .topics .topic.renamed");
    for (let i = renames.length - 1; i >= 0; i--) {
        const context =
            renames[i].parentNode.dataset.context +
            (renames[i].parentNode.dataset.context ? contextSeperator : "") +
            renames[i].dataset.topic;
        if (!deletedContexts.every((element) => !context.includes(element)))
            continue;
        tasks.push({
            taskNumber: taskNumber++,
            operation: "rename",
            route: "/data/rename",
            data: {
                context: context,
                data: renames[i].textContent,
            },
            deleted: [],
            created: [],
        });
    }
    return tasks;
}
function createTaskLine(task, callBack) {
    const button = document.createElement("button");
    button.textContent = task.data.context.replaceAll(contextSeperator, "\u2192");
    button.style.boxShadow = "none";
    button.addEventListener("click", callBack);
    const taskLine = document.createElement("div");
    taskLine.dataset.context = task.data.context;
    taskLine.className = "bar task";
    taskLine.innerHTML = `${task.taskNumber}. <div class="${operationState[task.operation]} operation">${operationState[task.operation]}</div>`;
    taskLine.appendChild(button);
    return taskLine;
}
async function executeTasks(tasks) {
    if (!tasks.length) return 0;
    loading();
    let fails = 0;
    for (let task of tasks) {
        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", server + task.route, true);
            xhr.withCredentials = true
            xhr.onerror = resolve;
            xhr.ontimeout = resolve;
            xhr.onload = () => {
                const parentTask = document.querySelector(
                    `#notice .tasks .bar.task[data-context="${task.data.context}"]`,
                );
                if (!(xhr.status === 200 || (hasFiled && xhr.status === 304))) {
                    parentTask.classList.add("failed");
                    fails++;
                    hasFiled = true;
                } else {
                    parentTask.dataset.context = null;
                    animateRemove(parentTask, "vanish 0.4s ease 0.1s", 0.4);
                }
                resolve();
            };
            xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            uploadFileChanges(task.created, task.deleted).then(
                () => {
                    xhr.send(
                        JSON.stringify({
                            context: task.data.context.split(contextSeperator),
                            data: task.data.data ? unwrapLinks(task.data.data) : undefined,
                        }),
                    );
                },
                (error) => {
                    if (!error) return;
                    uploadFileChanges([], task.created);
                    document
                        .querySelector(
                            `#notice .tasks .bar.task[data-context="${task.data.context}"]`,
                        )
                        .classList.add("failed");
                    console.error(
                        "Failed to upload files of task number",
                        task.taskNumber,
                        " because: ",
                        error,
                    );
                    fails++;
                    resolve();
                },
            );
        });
    }
    loading(false);
    if (fails) return fails;
    hasFiled = false;
    let success = document.createElement("h2");
    success.className = "success";
    success.textContent = "Saved!";
    document.querySelector("#notice .tasks").appendChild(success);
    topicTree.textContent = "";
    const loader = document.createElement("div");
    loader.className = "loader";
    document.getElementById("workspace").appendChild(loader);
    // Resetting
    const response = await fetch(server + '/data/layout', { credentials: 'include' })
    layout = await response.json()
    createOptions([]);
    const editors = document.querySelectorAll(".editor");
    for (let editor of editors) editor.parentNode.removeChild(editor);
    activeEditor = null;
    files = {};
    fileNo = 0;
    document.getElementById("workspace").removeChild(loader);
    return 0;
}
function addCreateTopicButton(topicBar) {
    const existingCreateTopic = topicBar.querySelector(".creator");
    if (existingCreateTopic) {
        const createOptionsButton = existingCreateTopic.querySelector(".create");
        const typeOptions = existingCreateTopic.querySelectorAll("button");
        for (let typeOption of typeOptions) typeOption.style.display = "none";
        createOptionsButton.style.opacity = 1;
        createOptionsButton.style.display = "block";
        return;
    }
    let createTopic = document.createElement("div");
    createTopic.className = "creator";
    let create = document.createElement("button");
    create.className = "create";
    create.textContent = "+";
    create.style.opacity = 0;
    let inned = false;
    createTopic.addEventListener("mouseenter", () => {
        if (inned) return;
        inned = true;
        const createOptionsButton = createTopic.querySelector(".create");
        if (!createOptionsButton) return;
        const typeOptions = createTopic.querySelectorAll("button");
        for (let typeOption of typeOptions) typeOption.style.display = "block";
        createOptionsButton.style.opacity = 0;
        createTopic.classList.add("expand");
    });
    createTopic.addEventListener("mouseleave", () => {
        if (!inned) return;
        inned = false;
        if (!createTopic.querySelector(".create")) return;
        addCreateTopicButton(topicBar);
        createTopic.classList.remove("expand");
    });
    topicBar.addEventListener("mouseenter", () => {
        create.style.opacity = 1;
        topicBar.querySelector('.AITrain').style.opacity = 1
        document.head.querySelector("#topics-scrollBar").innerHTML =
            `.bar .topics[data-context="${topicBar.querySelector(".topics").dataset.context}"]::-webkit-scrollbar {
        display: block;
        }`;
    });
    topicBar.addEventListener("mouseleave", () => {
        create.style.opacity = 0;
        topicBar.querySelector('.AITrain').style.opacity = 0
        document.head.querySelector("#topics-scrollBar").textContent = `
        .bar .topics[data-context="${topicBar.querySelector(".topics").dataset.context}"]::-webkit-scrollbar {
        display: none;
        }`;
    });
    const inputName = (type) => {
        createTopic.textContent = "";
        let fileName = document.createElement("input");
        fileName.dataset.type = type;
        fileName.dataset.context =
            topicBar.querySelector(".topics").dataset.context;
        fileName.placeholder = "topic name";
        fileName.addEventListener("keydown", (event) => {
            if (event.key === "Enter") createTopicFromTextarea(event);
        });
        createTopic.appendChild(fileName);
        fileName.focus();
    };
    let addFile = document.createElement("button");
    addFile.name = addFile.textContent = "file";
    addFile.style.display = "none";
    addFile.addEventListener("click", () => {
        inputName("file");
    });
    let addFolder = document.createElement("button");
    addFolder.name = addFolder.textContent = "folder";
    addFolder.style.display = "none";
    addFolder.addEventListener("click", () => {
        inputName("folder");
    });
    createTopic.appendChild(addFile);
    createTopic.appendChild(addFolder);
    createTopic.appendChild(create);
    topicBar.prepend(createTopic);
}
function addPlaceholder(context) {
    const placeholder = document.createElement("div");
    placeholder.className = "editor";
    placeholder.dataset.operation = "placeholder";
    placeholder.dataset.context = context;
    placeholder.style.display = "none";
    document.getElementById("workspace").appendChild(placeholder);
}
function createTopicFromTextarea(event) {
    const fileNameInput = document.querySelector(".bar .creator input");
    const newFileName = fileNameInput ? fileNameInput.value.trim() : undefined;
    const topiBar = fileNameInput.parentNode.parentNode.querySelector(".topics");
    if (!(newFileName && isValidTopicName(topiBar.children, newFileName))) return;
    event.preventDefault();
    const context = topiBar.dataset.context.split(contextSeperator);
    if (!context[0]) context.shift();
    let releventLayout = layout;
    for (let topic of context) releventLayout = releventLayout[topic];
    if (fileNameInput.dataset.type === "file") releventLayout[newFileName] = null;
    else if (fileNameInput.dataset.type === "folder") {
        releventLayout[newFileName] = {};
        addPlaceholder([...context.filter((element) => element !== ""), newFileName].join(contextSeperator));
        //document.getElementById('workspace').innerHTML += `<div class="editor text" data-type="placeholder" data-context="${[...context, newFileName].join('-')}" style="display:none;"></div>`
    }
    let createdTopicButton = createButton([
        ...context.filter((element) => element !== ""),
        newFileName,
    ]);
    createdTopicButton.classList.add("created");
    topiBar.appendChild(createdTopicButton);
    topiBar.parentNode.removeChild(fileNameInput.parentNode);
    addCreateTopicButton(topiBar.parentNode);
    createdTopicButton.dispatchEvent(new Event("click"));
}
function deleteTopic() {
    closeEditor();
    const notice = document.querySelector("#notice");
    let targetButton = selectedButton;
    if (notice.style.display !== "none") {
        const parentTask = document.querySelectorAll(
            `#notice .tasks .bar.task[data-context="${activeEditor.dataset.context}"]`,
        );
        const operation = parentTask[0].querySelector(".operation");
        if (operation.classList.contains("created"))
            animateRemove(parentTask[0], "vanish 0.4s ease 0.1s", 0.4);
        else {
            operation.className = "deleted operation";
            operation.textContent = "deleted";
            const gotoButton = parentTask[0].querySelector("button").cloneNode(true);
            gotoButton.addEventListener("click", () => {
                navigate(activeEditor.dataset.context);
            });
            parentTask[0].replaceChild(
                gotoButton,
                parentTask[0].querySelector("button"),
            );
        }
        for (let i = 1; i < parentTask.length; i++)
            animateRemove(parentTask[i], "vanish 0.4s ease 0.1s", 0.4);
        targetButton = getParentButton(activeEditor.dataset.context);
    }
    const context = [
        ...targetButton.parentNode.dataset.context
            .split(contextSeperator)
            .filter((element) => element !== ""),
        targetButton.dataset.topic,
    ].join(contextSeperator);
    const editor = document.querySelector(`.editor[data-context="${context}"]`);
    if (targetButton.classList.contains("created")) {
        targetButton.parentNode.removeChild(targetButton);
        if (editor.dataset.operation === "placeholder") {
            const createdBar = topicTree.querySelector(
                `.bar .topics[data-context="${editor.dataset.context}"]`,
            ).parentNode;
            createdBar.parentNode.removeChild(createdBar);
        }
        editor.parentNode.removeChild(editor);
        return;
    }
    targetButton.classList.add("deleted");
    if (!editor) addPlaceholder(context);
    deleteSubTopics(context);
}
function deleteSubTopics(context) {
    const existingTopicBar = document.querySelector(
        `.bar .topics[data-context="${context.split(contextSeperator).slice(0, -1).join(contextSeperator)}"]`,
    );
    if (existingTopicBar) {
        const parentIndex = Array.from(topicTree.children).indexOf(
            existingTopicBar.parentNode,
        );
        for (let i = parentIndex + 1; i < topicTree.children.length; i++)
            topicTree.children[i].style.display = "none";
    }
}
function navigate(context) {
    document.querySelector("#notice .close").dispatchEvent(new Event("click"));
    const button = getParentButton(context);
    context = context.split(contextSeperator);
    context.pop();
    const buttonBrothers = document.querySelector(
        `.bar .topics[data-context="${context.join(contextSeperator)}"]`,
    ).children;
    for (let brotherButton of buttonBrothers)
        brotherButton.classList.remove("selected");
    button.classList.add("selected");
    for (let i = 0; i < context.length; i++)
        topicTree
            .querySelector(`.topics[data-context="${context.slice(0, i).join(contextSeperator)}"]`)
            .querySelector(`.topic[data-topic="${context[i]}"]`)
            .dispatchEvent(new Event("click"));
    selectedButton = button;
}
function animateRemove(element, animation, delay, callBack) {
    element.style.animation = animation;
    setTimeout(
        () => {
            element.parentNode.removeChild(element);
            if (callBack) callBack();
        },
        (delay || 0) * 1000,
    );
}
function wrapLinks(text) {
    text = text.replace(/(?<!http:\/\/|https:\/\/)www\./g, "https://www.");
    const fileTag = {
        png: [
            `<img src="`,
            `" alt="pta chla ki galat leke main pta nikla" class="media" style="cursor:pointer">`,
        ],
        jpeg: [
            `<img src="`,
            `" alt="pta chla ki galat leke main pta nikla" class="media" style="cursor:pointer">`,
        ],
        jpg: [
            `<img src="`,
            `" alt="pta chla ki galat leke main pta nikla" class="media" style="cursor:pointer">`,
        ],
    };
    let trigger = "https://";
    let matchedCount = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i].toLowerCase() == trigger[matchedCount]) matchedCount++;
        else if (trigger[matchedCount] == "s") {
            matchedCount++;
            i--;
            continue;
        } else matchedCount = 0;
        if (matchedCount == trigger.length) {
            let start = i - trigger.length + 1 + (text[i - 3] != "s");
            if (text[start - 2] === "]" && text[start - 1] === "(") continue;
            let fileExtension;
            let got1stBracket = 0,
                got2ndBracket = 0;
            for (
                ;
                i < text.length &&
                !(
                    text[i] === " " ||
                    text[i] === '"' ||
                    text[i] === "\n" ||
                    text[i] === "\r" ||
                    text[i] === "," ||
                    (text[i] == "." && text[i + 1] == " ") ||
                    (!got1stBracket && text[i] == ")") ||
                    (!got2ndBracket && text[i] == "]")
                );
                i++
            ) {
                got1stBracket += "(" === text[i];
                got2ndBracket += "[" === text[i];
                got1stBracket -= ")" === text[i];
                got2ndBracket -= "]" === text[i];
                if (text[i] == ".") fileExtension = "";
                else fileExtension += text[i];
            }
            let link = text.slice(start, i);
            if (!isOurLink(link)) continue;
            if (link[link.length - 1] == ".") link = link.slice(0, -1);
            let remaining = text.length - i;
            if (fileTag.hasOwnProperty(fileExtension = fileExtension.toLowerCase()))
                text =
                    text.slice(0, start) +
                    fileTag[fileExtension][0] +
                    link +
                    fileTag[fileExtension][1] +
                    text.slice(i);
            else {
                const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" height="16">
        <text x="10" y="14" font-family="Arial" font-size="14" fill="blue">${link.split("/").pop()}</text></svg>`;
                const svgBlob = new Blob([svgContent], {
                    type: "image/svg+xml;charset=utf-8",
                });
                const svgUrl = URL.createObjectURL(svgBlob);
                text =
                    text.slice(0, start) +
                    `<img src="${svgUrl}" alt="pta chla ki galat leke main pta nikla" class="media" data-link="${link}">` +
                    text.slice(i);
            }
            i = text.length - remaining - 1;
        }
    }
    return text.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/\n\r|\n|\r/g, "<br>")

}
/**
 * @param {HTMLElement} textarea
 * @param {boolean} str specify if return type should be link string or HTML tag.
 * @param {boolean} all to include links which are not from our server.
 * @returns {string[] | HTMLElement[]} links Data type depends on str being true or false respectively.
 */
function getLinks(textarea, str, all) {
    const links = [];
    for (let element of textarea.children) {
        const link = element.dataset.link || element.src;
        if (link && (all || isOurLink(link))) links.push(str ? link : element);
    }
    return links;
}
function isOurLink(link) {
    const server = "https://api.vinaiak.com"
    return link.slice(0, server.length) == server;
}
function detectFileChanges(editor) {
    const finalLinks = Array.from(
        new Set(getLinks(editor.querySelector(".textarea"), false, true)),
    );
    const initialLinks = Array.from(
        new Set(editor.dataset.links ? editor.dataset.links.split(" ") : []),
    );
    return {
        deleted: initialLinks.filter((element) =>
            finalLinks.every(
                (finalElement) =>
                    (finalElement.dataset.link || finalElement.src) !== element,
            ),
        ),
        created: finalLinks.filter(
            (element) => !initialLinks.includes(element.dataset.link || element.src),
        ),
    };
}
function uploadFileChanges(createds, deleteds) {
    let createdProcessed = 0;
    return new Promise((resolve, reject) => {
        for (let deleted of deleteds) {
            const linkFragments = deleted.split("/");
            const fileName = linkFragments[linkFragments.length - 1];
            const xhr = new XMLHttpRequest();
            xhr.open("POST", server + "/uploads?delete=true", true);
            xhr.withCredentials = true
            xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            xhr.send(
                JSON.stringify({ fileName: fileName }),
            );
        }
        if (!createds.length) resolve();
        for (let created of createds) {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", server + "/uploads", true);
            xhr.withCredentials = true
            let req = new FormData();
            req.append("file", files[created.dataset.link]);
            xhr.onload = () => {
                if (xhr.status == 200)
                    created.parentNode.replaceChild(
                        document.createTextNode(
                            " " + xhr.responseText + " ",
                        ),
                        created,
                    );
                else created.parentNode.removeChild(created);
                createdProcessed++;
                if (createdProcessed >= createds.length) resolve();
            };
            xhr.send(req);
        }
    });
}
function unwrapLinks(textarea) {
    if (typeof textarea === "string") return textarea;
    let unwrapped = [];
    const children = textarea.childNodes;
    for (let child of children) {
        if (child.tagName === "IMG" || child.tagName === "A")
            unwrapped.push(child.dataset.link || child.src);
        else unwrapped.push(child.tagName === "BR" ? "\n" : child.data);
    }
    return unwrapped.join("");
}
function inputFiles(event, textarea) {
    const file = event.target.files[0];
    const type = file.type.split("/")[0];
    let element = document.createElement("img");
    if (type === "image") {
        element.src = URL.createObjectURL(file);
        element.className = "media upload image";
    } else {
        const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" height="16">
        <text x="10" y="14" font-family="Arial" font-size="14" fill="blue">${file.name}</text></svg>`;
        const svgBlob = new Blob([svgContent], {
            type: "image/svg+xml;charset=utf-8",
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        element.src = svgUrl;
        element.className = "media upload file";
    }
    files[fileNo] = file;
    element.dataset.link = fileNo++;
    event.target.value = "";
    textarea.appendChild(element);
}
function isValidTopicName(brotherTopics, topic) {
    if (topic === "examples" || topic.includes('"') || topic.includes(contextSeperator)) {
        showError(
            'Not allowed to create topic of name "examples" or containing double quotes (") or ' + contextSeperator,
        );
        return false;
    }
    for (let brotherTopic of brotherTopics) {
        if (topic.toLowerCase() === brotherTopic.textContent.toLowerCase()) {
            showError("Cannot create two topics with same name");
            return false;
        }
    }
    return true;
}
function openMarkdown(editor) {
    const markdown = (editor || activeEditor).querySelector(".markdown");
    markdown.innerHTML = marked.parse(
        (editor || activeEditor)
            .querySelector(".textarea")
            .innerHTML.replace(/<br>/g, "\n")
            .replace(/&nbsp;/g, " ").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    );
    markdown.style.display = "block";
    for (let a in markdown.querySelectorAll('a')) a.target = '_blank'
}
function focus(element) {
    element.focus();
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}
/**
 * @param {string} message
 * @param {number} stayTime in milli seconds
 * @param {string} color 
 * @returns {void}
  */
function showError(message, stayTime, color) {
    let error = document.createElement("h3");
    let closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.className = "close";
    closeButton.addEventListener("click", () => {
        error.parentNode.removeChild(error)
    });

    error.textContent = message;
    error.appendChild(closeButton)
    error.className = "error";
    if (color) error.style.color = color
    document.getElementById("workspace").appendChild(error);
    setTimeout(() => {
        animateRemove(error, "vanish 0.5s ease", 0.45);
    }, stayTime || 1000);
}
function textareaOnclick(event) {
    if (event.target.tagName === "IMG" || event.target.tagName === "A") {
        if (event.target.dataset.link) {
            if (event.target.dataset.link.includes("://")) {
                window.open(event.target.dataset.link, "_blank");
                return;
            }
            const tempUrl = URL.createObjectURL(files[event.target.dataset.link]);
            window.open(tempUrl, "_blank");
            setTimeout(() => {
                URL.revokeObjectURL(tempUrl);
            }, 10000);
        } else window.open(event.target.src || event.target.href, "_blank");
        event.preventDefault();
    }
}
