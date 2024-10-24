const vscode = require('vscode');
const UndoTreeProvider = require('./undotreeprovider.js');
const UndoTree = require('./undotree.js');
const { TreeNode } = require('./node.js');
const time = require('console')
const { parseJavaScript } = require('./testingparsing.js')
const { levenshteinDistance, isSimilar, relativeThreshold } = require('./levenshteinDist.js')
// const { getConfig } = require('./extension.js')
const Fuse = require('fuse.js')
const packageJson = require("../package.json")
const allStates = [];

let fuzzyThreshold = 0.15;
let LevinThreshold = 50;
let searchingAlgorithm = 'fuzzy';


function updateConfiguration() {
    const config = vscode.workspace.getConfiguration('undotree');
    fuzzyThreshold = parseFloat(config.get('fuzzyThreshold')) || 0.15;
    LevinThreshold = parseInt(config.get('LevinThreshold')) || 50;
    searchingAlgorithm = config.get('searchingAlgorithm') || 'fuzzy';
    console.log("sfgsdfgsdfsdfsdfsf", fuzzyThreshold, LevinThreshold, searchingAlgorithm)
}


let panel; // Declare panel globally
function getWebviewContent() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>All States</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #1e1e1e;
                    margin: 0;
                    padding: 20px;
                }
                    
                h1 {
                    color: #ffffff;
                    text-align: center;
                    margin-bottom: 20px;
                }
                #statesContainer {
                    display: flex;
                    flex-direction: column;
                    margin-top: 20px;
                }
                .state-item {
                    background-color: #2f2f2f;
                    // border: 1px solid #ccc;
                    border-radius: 10px;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow:#333333 ;
                }
                .codediv {
                    background-color: #1C1C1C;
                    // border: 1px solid #ccc;
                    background-color: #292929;
                    border: 1px solid #ccc;
                    padding: 20px;
                    border-radius: 10px;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    font-family: monospace;
                    overflow: auto;
                }
               .code-button {
    display: flex;
    align-items: flex-end; /* Corrected align-items */
    justify-content: flex-end; /* Corrected justify-content */
    margin-top: 10px;
}

                button {
                    margin-left: 10px;
                    margin-right: 10px;
                    padding: 8px 12px;
                    border: none;
                    background-color: #007acc;
                    color: white;
                    border-radius: 5px;
                    cursor: pointer;
                    transition: background-color 0.15s ease;
                }
                button:hover {
                    background-color: #005f99;
                }
                .copy-button {
                    background-color: #28a745;
                }
                .copy-button:hover {
                    background-color: #218838;
                }
                .notification {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background-color: #28a745;
                    color: white;
                    padding: 12px;
                    border-radius: 8px;
                    display: none;
                    opacity: 0;
                    transition: opacity 0.15s ease-in-out;
                }
                .notification.show {
                    display: block;
                    opacity: 1;
                }
            </style>
        </head>
        <body>
            <h1>All States</h1>
            <div id="statesContainer"></div>
            <button onclick="closeWebview()">Close</button>

            <div class="notification" id="copyNotification">Copied to clipboard!</div>

            <script>
                const vscode = acquireVsCodeApi();

                function closeWebview() {
                    vscode.postMessage({ command: 'close' });
                }

                function displayStates(states) {
                    const container = document.getElementById('statesContainer');
                    container.innerHTML = ''; // Clear previous states
                    states.forEach(state => {
                        // Create a div for each state
                        const stateDiv = document.createElement('div');
                        stateDiv.classList.add('state-item');

                        // Create a pre element for the code +++++++++++++++++++++
                        const pre = document.createElement('pre');
                        pre.classList.add('codediv');
                        pre.textContent = state; // Display each state in a <pre> tag

                        // Create a container for buttons
                        const buttonContainer = document.createElement('div');
                        buttonContainer.classList.add('code-button');

                        // Create the Replace button
                        const replaceButton = document.createElement('button');
                        replaceButton.textContent = 'Replace';
                        replaceButton.onclick = () => {
                            vscode.postMessage({ command: 'replaceText', data: state });
                        };

                        // Create the Copy button
                        const copyButton = document.createElement('button');
                        copyButton.textContent = 'Copy';
                        copyButton.classList.add('copy-button');
                        copyButton.onclick = () => {
                            copyToClipboard(state);
                        };

                        // Append buttons to button container
                        buttonContainer.appendChild(replaceButton);
                        buttonContainer.appendChild(copyButton);

                        // Append the pre and button container to the stateDiv
                        stateDiv.appendChild(buttonContainer);
                        stateDiv.appendChild(pre);

                        // Append the stateDiv to the main container
                        container.appendChild(stateDiv);
                    });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateStates':
                            displayStates(message.data);
                            break;
                    }
                });

                function copyToClipboard(text) {
                    navigator.clipboard.writeText(text).then(() => {
                        showNotification();
                    });
                }

                function showNotification() {
                    const notification = document.getElementById('copyNotification');
                    notification.classList.add('show');
                    setTimeout(() => {
                        notification.classList.remove('show');
                    }, 2000);
                }
            </script>
        </body>
        </html>
    `;
}

function createWebview(allStat, context) {
    if (panel) {
        // If the webview already exists and is not disposed, reveal it
        if (panel.viewType === 'allStatesView') {
            panel.reveal(vscode.ViewColumn.Two);
            return; // Exit early since the webview is already active
        } else {
            // If the existing panel has been disposed, create a new one
            panel = undefined;
        }
    }

    // Create a new webview panel
    panel = vscode.window.createWebviewPanel(
        'allStatesView', // Identifier
        'All States', // Title
        vscode.ViewColumn.Two, // Show in the first half of the screen
        {
            enableScripts: true // Enable JavaScript in the webview
        }
    );

    // Set the HTML content of the webview
    panel.webview.html = getWebviewContent();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'close':
                    panel.dispose(); // Close the webview if needed
                    panel = undefined; // Set to undefined after disposal
                    console.log("panel : ", panel)
                    break;
                case 'replaceText':
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const selection = editor.selection;
                        editor.edit(editBuilder => {
                            editBuilder.replace(selection, message.data); // Replace selected text
                        });
                    }
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    panel.onDidDispose(() => {
        panel = undefined; // Set panel to undefined on disposal
        console.log("Webview closed by user.");
        // Perform any additional cleanup or state updates here if needed
    });

    // Send the allStates data to the webview
    if (panel) {
        // console.log(allStat);
        console.log("checking if executed")
        panel.webview.postMessage({ command: 'updateStates', data: allStat });
    }
}



function searchContent(content, query, code) {
    // console.log("content", content)
    // console.log("query",query)
    const data = [{ content }]; // Create an array with an object that has the 'content' field

    const options = {
        includeScore: true,
        keys: ['content'], // We are searching in the 'content' field
        threshold: fuzzyThreshold, // Adjust this value to control the sensitivity of the search
    };

    const fuse = new Fuse(data, options); // Create a Fuse instance with the data
    const results = fuse.search(query); // Perform the search

    return fuse.search(query);
    // console.log(result)
    // // allStates.push(result)
    // if (result[0]?.score >= fuzzyThreshold) {
    //     allStates.push(code)
    // }
    // return result;
}

const DFStraversing = (rootNode, lexSelected, method, context) => {

    const stack = [rootNode];
    console.time()

    while (stack.length > 0) {
        const currentNode = stack.pop();

        currentNode.lexResult.functions.forEach(element => {
            console.log("check the current node for start of function", currentNode)
            lexSelected.functions.forEach(ele => {
                if (method === "levenshtein") {
                    if (relativeThreshold(element.normalisedBody, ele.normalisedBody, LevinThreshold)) {
                        allStates.push(element.code);
                    }
                } else {
                    const fuse = searchContent(element.normalisedBody, ele.normalisedBody);
                    console.log(fuse)
                    if (fuse[0]?.score >= fuzzyThreshold) {
                        allStates.push(element.code);
                    }
                }
            });
        });

        currentNode.lexResult.classes.forEach(element => {
            lexSelected.classes.forEach(ele => {
                if (method === "levenshtein") {
                    if (relativeThreshold(element.normalisedBody, ele.normalisedBody, LevinThreshold)) {
                        allStates.push(element.code);
                    }
                } else {
                    const fuse = searchContent(element.normalisedBody, ele.normalisedBody);
                    if (fuse[0]?.score >= fuzzyThreshold) {
                        allStates.push(element.code);
                    }
                }
            });
        });

        currentNode.lexResult.ifElseStatements.forEach(element => {
            lexSelected.ifElseStatements.forEach(ele => {
                if (method === "levenshtein") {
                    if (relativeThreshold(element.normalisedBody, ele.normalisedBody, LevinThreshold)) {
                        allStates.push(element.code);
                    }
                } else {
                    const fuse = searchContent(element.normalisedBody, ele.normalisedBody);
                    if (fuse[0]?.score >= fuzzyThreshold) {
                        allStates.push(element.code);
                    }
                }
            });
        });

        currentNode.lexResult.forLoops.forEach(element => {
            lexSelected.forLoops.forEach(ele => {
                if (method === "levenshtein") {
                    if (relativeThreshold(element.normalisedBody, ele.normalisedBody, LevinThreshold)) {
                        allStates.push(element.code);
                    }
                } else {
                    const fuse = searchContent(element.normalisedBody, ele.normalisedBody);
                    if (fuse[0]?.score >= fuzzyThreshold) {
                        allStates.push(element.code);
                    }
                }
            });
        });

        currentNode.lexResult.switchStatements.forEach(element => {
            lexSelected.switchStatements.forEach(ele => {
                if (method === "levenshtein") {
                    if (relativeThreshold(element.normalisedBody, ele.normalisedBody, LevinThreshold)) {
                        allStates.push(element.code);
                    }
                } else {
                    const fuse = searchContent(element.normalisedBody, ele.normalisedBody);
                    if (fuse[0]?.score >= fuzzyThreshold) {
                        allStates.push(element.code);
                    }
                }
            });
        });

        // Push children to the stack
        for (const child of currentNode.children) {
            stack.push(child);
        }
    }

    // vscode.showInformationMessage("done traversing")
    console.timeEnd()
    const uniqueStates = [...new Set(allStates)];
    createWebview(uniqueStates, context);
    return { success: true, data: uniqueStates };
}

const selective = (node, rootNode, context,) => {
    const editor = vscode.window.activeTextEditor;
    updateConfiguration();
    console.log("checking if variables work properly : ", LevinThreshold, fuzzyThreshold, searchingAlgorithm)
    if (editor) {
        const selection = editor.selection;

        const selectedText = editor.document.getText(selection);
        // console.log("selected text is ",selectedText);
        const lexSelected = parseJavaScript(selectedText);
        // console.log("\nlexed selected code : ", lexSelected);
        //levenshtein fuzzy these are two options
        const newStates = DFStraversing(rootNode, lexSelected, searchingAlgorithm, context);
        // console.log("\n\nthese are all states : ", newStates);

        // console.log("length = ",allStates.length)
        // if (newStates.success === 'true') {

        //     createWebview(newStates, context);
        // }


    } else {
        vscode.showInformationMessage("NO avtive editor !!");
        return;
    }
    // return;
    allStates.length = 0;
}
module.exports = selective;