/**
 * Multi-Species RNA-seq Analyzer Dashboard Logic
 */

// Global state variables
let gGenes = [];
let gIsReplicateMode = false;
let gSelectedGene = null;
let gActiveTab = 'upload-tab';
let gPathwayList = [];
let gCurrentSortKey = null;
let gCurrentSortOrder = 'none'; // 'none', 'asc', 'desc'
let gSessions = [];
let gActiveSessionId = null;
let gCurrentSelectedGOTerm = null;
let gCurrentSelectedGOGenes = [];
let gCurrentSpecies = 'sce'; // 'sce' (S. cerevisiae) or 'cgl' (C. glutamicum)
let gSelectedTfId = null;

// Base API URL (can be blank since we are hosting static files on same port)
const API_URL = "";

function safeAddListener(elementId, event, handler) {
    const el = document.getElementById(elementId);
    if (el) {
        el.addEventListener(event, handler);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const runInit = (name, fn) => {
        try {
            fn();
        } catch (e) {
            console.error(`[Init Error] Failed to execute ${name}:`, e);
        }
    };
    
    runInit("initSpeciesSelect", initSpeciesSelect);
    runInit("initTabs", initTabs);
    runInit("initDropzone", initDropzone);
    runInit("initControls", initControls);
    runInit("initSessions", initSessions);
    runInit("initAdvancedAnalysisBindings", initAdvancedAnalysisBindings);
    runInit("initGSHZoomPan", initGSHZoomPan);
    runInit("initGSHEditorBindings", initGSHEditorBindings);
    runInit("initIPTargetDiscoveryBindings", initIPTargetDiscoveryBindings);
    runInit("initPCAEvents", initPCAEvents);
    
    runInit("loadMockBtn", () => {
        const mockBtn = document.getElementById("load-mock-btn");
        if (mockBtn) {
            mockBtn.addEventListener("click", () => {
                gCurrentSpecies = "sce";
                const select = document.getElementById("species-select");
                if (select) select.value = "sce";
                updateSpeciesTitle("sce");
                loadMockData();
            });
        }
        const mockCoryneBtn = document.getElementById("load-mock-coryne-btn");
        if (mockCoryneBtn) {
            mockCoryneBtn.addEventListener("click", () => {
                gCurrentSpecies = "cgl";
                const select = document.getElementById("species-select");
                if (select) select.value = "cgl";
                updateSpeciesTitle("cgl");
                loadMockData();
            });
        }
        const mockEcoliBtn = document.getElementById("load-mock-ecoli-btn");
        if (mockEcoliBtn) {
            mockEcoliBtn.addEventListener("click", () => {
                gCurrentSpecies = "eco";
                const select = document.getElementById("species-select");
                if (select) select.value = "eco";
                updateSpeciesTitle("eco");
                loadMockData();
            });
        }
    });
});

function initSpeciesSelect() {
    const select = document.getElementById("species-select");
    if (select) {
        select.addEventListener("change", (e) => {
            gCurrentSpecies = e.target.value;
            gSelectedTfId = null;
            updateSpeciesTitle(gCurrentSpecies);
        });
    }
}

function updateSpeciesTitle(species) {
    gCurrentSpecies = species || 'sce';
    const titleEl = document.getElementById("page-title");
    const subTitleEl = document.querySelector(".header-subtitle");
    const logoText = document.querySelector(".logo-text");
    const activeMenuItem = document.querySelector(`.menu-item[data-tab="${gActiveTab}"] .menu-text`);
    const menuStr = activeMenuItem ? activeMenuItem.textContent : "데이터 업로드";
    
    if (gCurrentSpecies === 'cgl') {
        if (titleEl) titleEl.textContent = `C. glutamicum RNA-seq - ${menuStr}`;
        if (subTitleEl) subTitleEl.textContent = "코리네박테리움 글루타미쿰 raw expression 데이터 기반 DEG 시각화 및 기능성 맵핑 분석 도구";
        if (logoText) logoText.textContent = "CoryneRNA";
    } else if (gCurrentSpecies === 'eco') {
        if (titleEl) titleEl.textContent = `E. coli RNA-seq - ${menuStr}`;
        if (subTitleEl) subTitleEl.textContent = "대장균 (Escherichia coli K-12) raw expression 데이터 기반 DEG 시각화 및 기능성 맵핑 분석 도구";
        if (logoText) logoText.textContent = "ColiRNA";
    } else {
        if (titleEl) titleEl.textContent = `S. cerevisiae RNA-seq - ${menuStr}`;
        if (subTitleEl) subTitleEl.textContent = "효모 raw expression 데이터 기반 DEG 시각화 및 기능성 맵핑 분석 도구";
        if (logoText) logoText.textContent = "YeastRNA";
    }
    
    // Refresh sessions for newly selected species
    if (typeof loadSessions === "function") {
        loadSessions();
    }
    
    // Refresh KEGG pathways for newly selected species
    if (typeof fetchKEGGPathways === "function") {
        fetchKEGGPathways();
    }

    // Refresh Custom Pathway dropdown for newly selected species
    if (typeof initializeMapDropdown === "function") {
        initializeMapDropdown();
        if (typeof selectAndLoadMap === "function") {
            selectAndLoadMap(currentMapId);
        }
    }
}

// ----------------------------------------------------------------------
// 1. Tab Navigation
// ----------------------------------------------------------------------
function initTabs() {
    const menuItems = document.querySelectorAll(".menu-item");
    menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            if (item.classList.contains("disabled")) return;
            
            const tabId = item.getAttribute("data-tab");
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    gActiveTab = tabId;
    
    // Update menu items active class
    const menuItems = document.querySelectorAll(".menu-item");
    menuItems.forEach(item => {
        if (item.getAttribute("data-tab") === tabId) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
    
    // Update tab panes visibility
    const panes = document.querySelectorAll(".tab-pane");
    panes.forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add("active");
        } else {
            pane.classList.remove("active");
        }
    });
    
    // Update Header Title dynamically based on Tab and active Species
    const titleEl = document.getElementById("page-title");
    const menuItem = document.querySelector(`.menu-item[data-tab="${tabId}"] .menu-text`);
    const menuText = menuItem ? menuItem.textContent : "";
    let speciesName = 'S. cerevisiae';
    if (gCurrentSpecies === 'cgl') speciesName = 'C. glutamicum';
    else if (gCurrentSpecies === 'eco') speciesName = 'E. coli';
    if (titleEl) titleEl.textContent = `${speciesName} RNA-seq - ${menuText}`;
    
    // Trigger chart redraws if necessary (Plotly sometimes needs to resize on tab show)
    if (tabId === 'volcano-tab') {
        renderVolcanoOrMAPlot();
    } else if (tabId === 'heatmap-tab') {
        renderHeatmap();
    } else if (tabId === 'pca-tab') {
        renderPCAPlot();
    } else if (tabId === 'network-tab') {
        renderNetworkGraph();
    } else if (tabId === 'motif-tab') {
        renderMotifLogoPlaceholder();
    } else if (tabId === 'custom-pathway-tab') {
        loadGSHPathwayData();
        resetGSHZoom();
    }
}

// Enable tabs after successful upload
function enableAnalysisTabs() {
    const menuItems = document.querySelectorAll(".sidebar-menu .menu-item");
    menuItems.forEach(item => {
        item.classList.remove("disabled");
    });
}

function updateDEGTableHeaders() {
    const ctrlName = (window.gSampleMetadata && window.gSampleMetadata.control_name) ? window.gSampleMetadata.control_name : "WT";
    const treatName = (window.gSampleMetadata && window.gSampleMetadata.treated_name) ? window.gSampleMetadata.treated_name : "Mutant";
    
    const thWt = document.getElementById("deg-th-wt");
    if (thWt) {
        thWt.innerHTML = `${escapeHtml(ctrlName)} 발현 (평균) <i class="fa-solid fa-sort sort-icon"></i>`;
    }
    const thMut = document.getElementById("deg-th-mutant");
    if (thMut) {
        thMut.innerHTML = `${escapeHtml(treatName)} 발현 (평균) <i class="fa-solid fa-sort sort-icon"></i>`;
    }
}

// ----------------------------------------------------------------------
// 1-1. Session History Management
// ----------------------------------------------------------------------
function initSessions() {
    const sessionSelect = document.getElementById("header-session-select");
    if (sessionSelect) {
        sessionSelect.addEventListener("change", (e) => {
            const sid = e.target.value;
            if (sid && sid !== gActiveSessionId) {
                switchSession(sid);
            }
        });
    }
    
    const renameBtn = document.getElementById("btn-rename-active-session");
    if (renameBtn) {
        renameBtn.addEventListener("click", () => {
            if (!gActiveSessionId) return;
            const currentSession = gSessions.find(s => s.id === gActiveSessionId);
            const curName = currentSession ? currentSession.name : "";
            renameSession(gActiveSessionId, curName);
        });
    }
    
    const deleteBtn = document.getElementById("btn-delete-active-session");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
            if (!gActiveSessionId) return;
            deleteSession(gActiveSessionId);
        });
    }
    
    // Initial load of sessions
    loadSessions();
}

function loadSessions() {
    let url = `${API_URL}/api/sessions`;
    if (gCurrentSpecies) {
        url += `?species=${gCurrentSpecies}`;
    }
    fetch(url)
        .then(r => r.json())
        .then(data => {
            gSessions = data.sessions || [];
            gActiveSessionId = data.active_session_id || null;
            updateSessionDropdown();
            renderSessionCatalog();
        })
        .catch(err => {
            console.error("Failed to load sessions:", err);
        });
}

function updateSessionDropdown() {
    const select = document.getElementById("header-session-select");
    if (!select) return;
    
    select.innerHTML = "";
    if (!gSessions || gSessions.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "저장된 세션 없음";
        select.appendChild(opt);
        return;
    }
    
    gSessions.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.gene_count || 0}개 유전자)`;
        if (s.id === gActiveSessionId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function renderSessionCatalog() {
    const container = document.getElementById("session-catalog-list");
    const countBadge = document.getElementById("session-count-badge");
    if (!container) return;
    
    if (countBadge) {
        countBadge.textContent = `${gSessions.length}개의 세션`;
    }
    
    if (!gSessions || gSessions.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 24px;">
                <i class="fa-solid fa-folder-open" style="font-size: 32px; margin-bottom: 8px;"></i>
                <p>저장된 분석 세션이 없습니다. 새로운 RNA-seq 데이터를 업로드하여 첫 번째 세션을 생성해 보세요!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = "";
    gSessions.forEach(s => {
        const isActive = s.id === gActiveSessionId;
        const card = document.createElement("div");
        card.className = `session-card-item ${isActive ? "active-session-card" : ""}`;
        
        card.innerHTML = `
            <div class="session-card-header">
                <div class="session-card-title">
                    <i class="fa-solid fa-file-waveform icon-margin" style="color: ${isActive ? '#2563eb' : '#64748b'};"></i>
                    ${escapeHtml(s.name)}
                </div>
                ${isActive ? '<span class="session-active-badge">현재 세션</span>' : ''}
            </div>
            <div class="session-card-meta">
                <div><i class="fa-regular fa-clock"></i> 생성일시: ${s.created_at || '-'}</div>
                <div><i class="fa-regular fa-file"></i> 원본파일: ${escapeHtml(s.source_name || '-')}</div>
                <div class="session-stats-row">
                    <span class="session-stat-up">▲ UP: ${s.up_count || 0}</span>
                    <span class="session-stat-down">▼ DOWN: ${s.down_count || 0}</span>
                    <span style="color: #64748b;">전체: ${s.gene_count || 0}</span>
                </div>
            </div>
            <div class="session-card-actions">
                ${!isActive ? `<button class="btn btn-primary btn-sm btn-switch-session" data-id="${s.id}" style="padding: 4px 10px; font-size: 12px;"><i class="fa-solid fa-right-to-bracket"></i> 전환</button>` : ''}
                <button class="btn btn-secondary btn-sm btn-rename-session" data-id="${s.id}" data-name="${escapeHtml(s.name)}" style="padding: 4px 10px; font-size: 12px;"><i class="fa-solid fa-pen"></i> 수정</button>
                <button class="btn btn-secondary btn-sm btn-delete-session" data-id="${s.id}" style="padding: 4px 10px; font-size: 12px; color: #ef4444;"><i class="fa-solid fa-trash"></i> 삭제</button>
            </div>
        `;
        
        container.appendChild(card);
    });
    
    // Bind button events
    container.querySelectorAll(".btn-switch-session").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = btn.getAttribute("data-id");
            switchSession(sid);
        });
    });
    
    container.querySelectorAll(".btn-rename-session").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = btn.getAttribute("data-id");
            const curName = btn.getAttribute("data-name");
            renameSession(sid, curName);
        });
    });
    
    container.querySelectorAll(".btn-delete-session").forEach(btn => {
        btn.addEventListener("click", () => {
            const sid = btn.getAttribute("data-id");
            deleteSession(sid);
        });
    });
}

function escapeHtml(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function switchSession(sessionId) {
    updateStatus("analyzing", "세션 데이터 전환 중...");
    fetch(`${API_URL}/api/sessions/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId })
    })
    .then(r => {
        if (!r.ok) throw new Error("세션 전환 실패");
        return r.json();
    })
    .then(data => {
        gGenes = data.genes || [];
        gActiveSessionId = data.active_session_id;
        if (data.sample_metadata) {
            window.gSampleMetadata = data.sample_metadata;
        }
        gIsReplicateMode = gGenes.length > 0 && gGenes[0].hasOwnProperty("fdr") && gGenes[0].fdr !== null;
        
        loadSessions(); // Refresh UI dropdown and catalog cards
        finalizeDataLoading();
    })
    .catch(err => {
        alert(`세션 전환 오류: ${err.message}`);
        updateStatus("ready", "대기 중");
    });
}

function renameSession(sessionId, currentName) {
    const newName = prompt("새로운 세션 이름을 입력하세요:", currentName);
    if (!newName || newName.trim() === "" || newName === currentName) return;
    
    fetch(`${API_URL}/api/sessions/${sessionId}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() })
    })
    .then(r => {
        if (!r.ok) throw new Error("세션 이름 변경 실패");
        return r.json();
    })
    .then(() => {
        loadSessions();
        if (sessionId === gActiveSessionId) {
            updateSessionDropdown();
        }
    })
    .catch(err => {
        alert(`세션 이름 변경 오류: ${err.message}`);
    });
}

function deleteSession(sessionId) {
    const targetSession = gSessions.find(s => s.id === sessionId);
    const sessionName = targetSession ? targetSession.name : "이 세션";
    
    if (!confirm(`정말로 '${sessionName}' 세션을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
        return;
    }
    
    fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: "DELETE"
    })
    .then(r => {
        if (!r.ok) throw new Error("세션 삭제 실패");
        return r.json();
    })
    .then(data => {
        const activeChanged = gActiveSessionId === sessionId;
        gActiveSessionId = data.active_session_id;
        
        if (activeChanged && gActiveSessionId) {
            switchSession(gActiveSessionId);
        } else {
            loadSessions();
            if (!gActiveSessionId) {
                gGenes = [];
                renderDEGTable();
            }
        }
    })
    .catch(err => {
        alert(`세션 삭제 오류: ${err.message}`);
    });
}

// ----------------------------------------------------------------------
// 2. File Upload & Mock Data
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// 2. File Upload & Mock Data
// ----------------------------------------------------------------------
let hotInstance = null;
let isFallbackGrid = false;

// Default Excel Grid sample data
const defaultGridData = [
    ["locus_tag", "Gene_Symbol", "WT_Rep1", "WT_Rep2", "WT_Rep3", "Mutant_Rep1", "Mutant_Rep2", "Mutant_Rep3"],
    ["YAL038W", "CDC19", "1200.5", "1150.2", "1250.8", "340.2", "320.5", "310.8"],
    ["YGR192C", "TDH3", "2400.1", "2450.4", "2390.9", "4500.8", "4600.2", "4450.5"],
    ["YFL039C", "ACT1", "850.3", "900.2", "870.5", "890.1", "860.4", "880.2"],
    ["YLR355C", "ILD1", "10.2", "12.5", "9.8", "120.5", "115.8", "130.2"],
    ["YDL215C", "GDH2", "50.5", "45.2", "55.8", "5.1", "4.8", "5.5"],
    ["YJR009C", "LUT2", "150.2", "160.5", "140.8", "850.3", "900.2", "870.5"],
    ["YKL060C", "FBA1", "300.5", "310.2", "290.8", "120.2", "130.5", "110.8"],
    ["YOL086C", "ADH1", "5000.5", "5100.2", "4900.8", "1500.2", "1600.5", "1400.8"]
];

// Fallback HTML table grid generator (for offline or loading failures)
function initFallbackGrid(gridEl) {
    isFallbackGrid = true;
    gridEl.innerHTML = "";
    gridEl.style.overflow = "auto";
    gridEl.style.height = "320px";
    
    const table = document.createElement("table");
    table.id = "fallback-html-table";
    table.className = "fallback-excel-table";
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    
    gridEl.appendChild(table);
    
    // Load default data
    loadFallbackData(defaultGridData);
    
    // Add paste event listener for Excel copy-paste compatibility
    table.addEventListener("paste", function(e) {
        e.preventDefault();
        const clipboardData = e.clipboardData || window.clipboardData;
        const pastedData = clipboardData.getData("Text");
        
        const rows = pastedData.split(/\r?\n/).map(row => row.split("\t"));
        if (rows.length === 0 || rows[0].length === 0) return;
        
        const activeCell = document.activeElement;
        if (!activeCell || activeCell.tagName !== "TD") return;
        
        const startRowIdx = activeCell.parentElement.rowIndex;
        const startColIdx = activeCell.cellIndex;
        
        const trs = table.rows;
        rows.forEach((rowData, rOffset) => {
            const targetRowIdx = startRowIdx + rOffset;
            
            while (targetRowIdx >= trs.length) {
                fallbackAddRow();
            }
            
            const tr = trs[targetRowIdx];
            rowData.forEach((val, cOffset) => {
                const targetColIdx = startColIdx + cOffset;
                
                while (targetColIdx >= tr.cells.length) {
                    fallbackAddCol();
                }
                
                tr.cells[targetColIdx].textContent = val;
            });
        });
    });
}

function loadFallbackData(dataArray) {
    const table = document.getElementById("fallback-html-table");
    if (!table) return;
    table.innerHTML = "";
    
    dataArray.forEach((rowData) => {
        const tr = document.createElement("tr");
        rowData.forEach((val) => {
            const td = document.createElement("td");
            td.contentEditable = "true";
            td.textContent = val;
            td.style.border = "1px solid #cbd5e1";
            td.style.padding = "6px 8px";
            td.style.minWidth = "80px";
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    
    const currentRows = dataArray.length;
    const colCount = dataArray[0] ? dataArray[0].length : 8;
    for (let i = 0; i < (35 - currentRows); i++) {
        const tr = document.createElement("tr");
        for (let j = 0; j < colCount; j++) {
            const td = document.createElement("td");
            td.contentEditable = "true";
            td.style.border = "1px solid #cbd5e1";
            td.style.padding = "6px 8px";
            td.style.minWidth = "80px";
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
}

function fallbackAddRow() {
    const table = document.getElementById("fallback-html-table");
    if (!table) return;
    const colCount = table.rows[0] ? table.rows[0].cells.length : 8;
    const tr = document.createElement("tr");
    for (let i = 0; i < colCount; i++) {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.style.border = "1px solid #cbd5e1";
        td.style.padding = "6px 8px";
        td.style.minWidth = "80px";
        tr.appendChild(td);
    }
    table.appendChild(tr);
}

function fallbackAddCol() {
    const table = document.getElementById("fallback-html-table");
    if (!table) return;
    for (let i = 0; i < table.rows.length; i++) {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.style.border = "1px solid #cbd5e1";
        td.style.padding = "6px 8px";
        td.style.minWidth = "80px";
        table.rows[i].appendChild(td);
    }
}

// Automatically predict next column name (e.g. Sample_2, Mutant_Rep4) and insert new column
function addNewColumnAutomatically() {
    const addCount = parseInt(document.getElementById("grid-add-col-count").value, 10) || 1;
    
    if (isFallbackGrid) {
        for (let c = 0; c < addCount; c++) {
            fallbackAddCol();
            const table = document.getElementById("fallback-html-table");
            if (table && table.rows[0]) {
                const currentCols = table.rows[0].cells.length;
                const newColName = "Sample_" + currentCols;
                const lastCell = table.rows[0].cells[currentCols - 1];
                lastCell.textContent = newColName;
            }
        }
    } else if (hotInstance) {
        try {
            const gridData = hotInstance.getData();
            if (!gridData || gridData.length === 0) return;
            
            const selected = hotInstance.getSelected();
            let colIdx = (gridData[0] ? gridData[0].length : 8) - 1;
            if (selected && selected.length > 0) {
                colIdx = Math.max(selected[0][1], selected[0][3]);
            }
            
            const firstRow = gridData[0] || [];
            const baseColVal = String(firstRow[colIdx] || "Sample_1").trim();
            
            // Extract prefix and number pattern (e.g. "WT_Rep3" -> prefix="WT_Rep", num=3)
            const match = baseColVal.match(/^(.*?)([\-_]?)(\d+)$/);
            let prefix = "Sample_";
            let separator = "";
            let startNum = colIdx + 1;
            
            if (match) {
                prefix = match[1];
                separator = match[2];
                startNum = parseInt(match[3], 10);
            } else {
                prefix = baseColVal + "_";
                startNum = 1;
            }
            
            for (let c = 0; c < addCount; c++) {
                const genColName = `${prefix}${separator}${startNum + 1 + c}`;
                gridData.forEach((row, rIdx) => {
                    if (rIdx === 0) {
                        row.splice(colIdx + 1 + c, 0, genColName);
                    } else {
                        row.splice(colIdx + 1 + c, 0, "");
                    }
                });
            }
            
            hotInstance.loadData(gridData);
        } catch (err) {
            console.error("Failed to add columns:", err);
            alert("열을 추가하는 도중 에러가 발생했습니다: " + err.message);
        }
    }
}

function fallbackDelRow() {
    const table = document.getElementById("fallback-html-table");
    if (!table) return;
    
    const activeCell = document.activeElement;
    if (activeCell && activeCell.tagName === "TD") {
        const rowIndex = activeCell.parentElement.rowIndex;
        if (table.rows.length > 1) {
            table.deleteRow(rowIndex);
        }
    } else {
        if (table.rows.length > 1) {
            table.deleteRow(table.rows.length - 1);
        }
    }
}

function fallbackDelCol() {
    const table = document.getElementById("fallback-html-table");
    if (!table) return;
    
    const activeCell = document.activeElement;
    let colIndex = -1;
    if (activeCell && activeCell.tagName === "TD") {
        colIndex = activeCell.cellIndex;
    } else {
        colIndex = table.rows[0] ? table.rows[0].cells.length - 1 : -1;
    }
    
    if (colIndex !== -1 && (table.rows[0] && table.rows[0].cells.length > 1)) {
        for (let i = 0; i < table.rows.length; i++) {
            table.rows[i].deleteCell(colIndex);
        }
    }
}

function getFallbackData() {
    const table = document.getElementById("fallback-html-table");
    if (!table) return [];
    
    const data = [];
    for (let i = 0; i < table.rows.length; i++) {
        const rowData = [];
        const cells = table.rows[i].cells;
        for (let j = 0; j < cells.length; j++) {
            rowData.push(cells[j].textContent);
        }
        data.push(rowData);
    }
    return data;
}

function initDropzone() {
    // 1. File Upload Elements
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    const fileInfo = document.getElementById("file-info");
    const selectedFileName = document.getElementById("selected-file-name");
    const analyzeBtn = document.getElementById("analyze-btn");
    
    // 2. Text Upload Elements
    const toggleFileUpload = document.getElementById("toggle-file-upload");
    const toggleTextUpload = document.getElementById("toggle-text-upload");
    const fileUploadContainer = document.getElementById("file-upload-container");
    const textUploadContainer = document.getElementById("text-upload-container");
    const analyzeTextBtn = document.getElementById("analyze-text-btn");
    
    // Initialize Handsontable or fallback HTML grid
    const gridEl = document.getElementById("excel-grid");
    if (gridEl) {
        if (typeof Handsontable !== "undefined") {
            try {
                // Prepare default data copy
                const sampleData = JSON.parse(JSON.stringify(defaultGridData));
                for (let i = 0; i < 30; i++) {
                    sampleData.push(["", "", "", "", "", "", "", ""]);
                }
                
                hotInstance = new Handsontable(gridEl, {
                    data: sampleData,
                    rowHeaders: true,
                    colHeaders: true,
                    contextMenu: true,
                    minSpareRows: 1,
                    stretchH: "all",
                    width: "100%",
                    height: "320px",
                    licenseKey: "non-commercial-and-evaluation"
                });
            } catch (e) {
                console.error("Handsontable initialization failed, loading fallback grid:", e);
                initFallbackGrid(gridEl);
            }
        } else {
            console.warn("Handsontable is not defined. Loading fallback HTML grid.");
            initFallbackGrid(gridEl);
        }
    }
    
    // Toggle UI logic
    toggleFileUpload.addEventListener("click", () => {
        toggleFileUpload.classList.add("active");
        toggleTextUpload.classList.remove("active");
        fileUploadContainer.style.display = "block";
        textUploadContainer.style.display = "none";
    });
    
    toggleTextUpload.addEventListener("click", () => {
        toggleTextUpload.classList.add("active");
        toggleFileUpload.classList.remove("active");
        textUploadContainer.style.display = "block";
        fileUploadContainer.style.display = "none";
        
        // Render/Resize grid
        if (isFallbackGrid) {
            // Nothing to do
        } else if (hotInstance) {
            setTimeout(() => {
                hotInstance.render();
            }, 50);
        }
    });
    
    // Grid Control Buttons Event Listeners
    document.getElementById("btn-grid-add-row").addEventListener("click", () => {
        const addCount = parseInt(document.getElementById("grid-add-row-count").value, 10) || 1;
        
        if (isFallbackGrid) {
            for (let r = 0; r < addCount; r++) {
                fallbackAddRow();
            }
        } else if (hotInstance) {
            try {
                const gridData = hotInstance.getData();
                if (!gridData || gridData.length === 0) return;
                
                const selected = hotInstance.getSelected();
                let rowIdx = gridData.length - 1;
                if (selected && selected.length > 0) {
                    rowIdx = Math.max(selected[0][0], selected[0][2]);
                }
                
                const colCount = gridData[0] ? gridData[0].length : 8;
                
                // Splice empty rows based on specified addCount
                for (let r = 0; r < addCount; r++) {
                    const newRow = Array(colCount).fill("");
                    gridData.splice(rowIdx + 1 + r, 0, newRow);
                }
                
                hotInstance.loadData(gridData);
            } catch (err) {
                console.error("Failed to add rows:", err);
            }
        }
    });

    document.getElementById("btn-grid-del-row").addEventListener("click", () => {
        if (isFallbackGrid) {
            fallbackDelRow();
        } else if (hotInstance) {
            try {
                const gridData = hotInstance.getData();
                if (!gridData || gridData.length <= 1) return;
                
                const selected = hotInstance.getSelected();
                if (selected && selected.length > 0) {
                    const startRow = Math.min(selected[0][0], selected[0][2]);
                    const endRow = Math.max(selected[0][0], selected[0][2]);
                    const count = endRow - startRow + 1;
                    gridData.splice(startRow, count);
                } else {
                    gridData.pop();
                }
                hotInstance.loadData(gridData);
            } catch (err) {
                console.error("Failed to delete row:", err);
            }
        }
    });

    document.getElementById("btn-grid-add-col").addEventListener("click", () => {
        addNewColumnAutomatically();
    });

    document.getElementById("btn-grid-del-col").addEventListener("click", () => {
        if (isFallbackGrid) {
            fallbackDelCol();
        } else if (hotInstance) {
            try {
                const gridData = hotInstance.getData();
                if (!gridData || gridData.length === 0) return;
                
                const selected = hotInstance.getSelected();
                let colIdx = (gridData[0] ? gridData[0].length : 8) - 1;
                let count = 1;
                if (selected && selected.length > 0) {
                    colIdx = Math.min(selected[0][1], selected[0][3]);
                    const endCol = Math.max(selected[0][1], selected[0][3]);
                    count = endCol - colIdx + 1;
                }
                
                // Ensure we don't delete all columns
                if (gridData[0].length > count) {
                    gridData.forEach(row => {
                        row.splice(colIdx, count);
                    });
                    hotInstance.loadData(gridData);
                }
            } catch (err) {
                console.error("Failed to delete column:", err);
            }
        }
    });

    document.getElementById("btn-grid-clear").addEventListener("click", () => {
        const headerRow = ["locus_tag", "Gene_Symbol", "WT_Rep1", "WT_Rep2", "WT_Rep3", "Mutant_Rep1", "Mutant_Rep2", "Mutant_Rep3"];
        const emptyData = [headerRow];
        for (let i = 0; i < 30; i++) {
            emptyData.push(["", "", "", "", "", "", "", ""]);
        }
        
        if (isFallbackGrid) {
            loadFallbackData(emptyData);
        } else if (hotInstance) {
            hotInstance.loadData(emptyData);
        }
    });

    document.getElementById("btn-grid-sample").addEventListener("click", () => {
        const sampleData = JSON.parse(JSON.stringify(defaultGridData));
        if (isFallbackGrid) {
            loadFallbackData(sampleData);
        } else if (hotInstance) {
            hotInstance.loadData(sampleData);
        }
    });
    
    // Trigger input click on dropzone click
    dropzone.addEventListener("click", () => fileInput.click());
    
    // Drag and drop classes
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    
    ["dragleave", "drop"].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
            dropzone.classList.remove("dragover");
        });
    });
    
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect(fileInput.files[0]);
        }
    });
    
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length) {
            handleFileSelect(fileInput.files[0]);
        }
    });
    
    function handleFileSelect(file) {
        selectedFileName.textContent = file.name;
        fileInfo.style.display = "flex";
    }
    
    analyzeBtn.addEventListener("click", () => {
        const file = fileInput.files[0];
        if (!file) return;
        
        uploadFile(file);
    });
    
    // Grid data submission and TSV parsing trigger
    analyzeTextBtn.addEventListener("click", () => {
        const gridData = isFallbackGrid ? getFallbackData() : (hotInstance ? hotInstance.getData() : []);
        const tsvRows = [];

        gridData.forEach((row) => {
            const hasContent = row.some(cell => cell !== null && String(cell).trim() !== "");
            if (hasContent) {
                const cleanRow = row.map(cell => {
                    if (cell === null || cell === undefined) return "";
                    return String(cell).replace(/[\t\r\n]/g, " ");
                });
                tsvRows.push(cleanRow.join("\t"));
            }
        });

        if (tsvRows.length < 2) {
            alert("그리드에 데이터를 입력해 주세요. 최소한 헤더 행과 1개 이상의 데이터 행이 필요합니다.");
            return;
        }

        const tsvText = tsvRows.join("\n");
        uploadText(tsvText);
    });
}

function updateStatus(state, text) {
    const badge = document.getElementById("status-badge");
    badge.className = `status-indicator ${state}`;
    badge.querySelector(".status-text").textContent = text;
}

function uploadFile(file) {
    updateStatus("analyzing", "데이터 분석 중...");
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("species", gCurrentSpecies);
    
    fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.detail || "파일 파싱 실패") });
        }
        return response.json();
    })
    .then(data => {
        processUploadedData(data);
    })
    .catch(err => {
        alert(`에러: ${err.message}`);
        updateStatus("ready", "대기 중");
    });
}

function uploadText(text) {
    updateStatus("analyzing", "데이터 분석 중...");
    
    fetch(`${API_URL}/api/upload_text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, species: gCurrentSpecies })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.detail || "텍스트 파싱 실패") });
        }
        return response.json();
    })
    .then(data => {
        processUploadedData(data);
    })
    .catch(err => {
        alert(`에러: ${err.message}`);
        updateStatus("ready", "대기 중");
    });
}

function loadMockData() {
    updateStatus("analyzing", "기본 예제 분석 데이터 로드 중...");
    let mockFileUrl = "/mock_yeast_rnaseq.xlsx";
    let fileName = "mock_yeast_rnaseq.xlsx";
    if (gCurrentSpecies === "cgl") {
        mockFileUrl = "/mock_coryne_rnaseq.xlsx";
        fileName = "mock_coryne_rnaseq.xlsx";
    } else if (gCurrentSpecies === "eco") {
        mockFileUrl = "/mock_ecoli_rnaseq.xlsx";
        fileName = "mock_ecoli_rnaseq.xlsx";
    }
    
    fetch(mockFileUrl)
        .then(res => {
            if (!res.ok) throw new Error("Sample file not found on server.");
            return res.blob();
        })
        .then(blob => {
            const file = new File([blob], fileName, {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
            uploadFile(file);
        })
        .catch(err => {
            alert("기본 예제 엑셀 파일을 가져오지 못했습니다. 서버에서 예제 데이터 파일 존재 여부를 확인해주세요.");
            updateStatus("ready", "대기 중");
        });
}

function processUploadedData(data) {
    gGenes = data.genes || [];
    if (data.hasOwnProperty("is_replicate_mode")) {
        gIsReplicateMode = data.is_replicate_mode;
    } else {
        gIsReplicateMode = gGenes.length > 0 && gGenes[0].hasOwnProperty("fdr") && gGenes[0].fdr !== null;
    }
    if (data.sample_metadata) {
        window.gSampleMetadata = data.sample_metadata;
    }
    if (data.session && data.session.id) {
        gActiveSessionId = data.session.id;
    }
    if (data.species) {
        gCurrentSpecies = data.species;
        const select = document.getElementById("species-select");
        if (select) select.value = data.species;
        updateSpeciesTitle(data.species);
    }
    
    // Fetch all genes to get full dataset for active session
    const sidParam = gActiveSessionId ? `?session_id=${encodeURIComponent(gActiveSessionId)}` : '';
    fetch(`${API_URL}/api/genes${sidParam}`)
        .then(r => {
            if (!r.ok) throw new Error("전체 유전자 데이터 로드 실패");
            return r.json();
        })
        .then(fullData => {
            if (fullData.genes && fullData.genes.length > 0) {
                gGenes = fullData.genes;
            }
            if (fullData.sample_metadata) {
                window.gSampleMetadata = fullData.sample_metadata;
            }
            if (fullData.species) {
                gCurrentSpecies = fullData.species;
                const select = document.getElementById("species-select");
                if (select) select.value = fullData.species;
                updateSpeciesTitle(fullData.species);
            }
            gIsReplicateMode = gGenes.length > 0 && gGenes[0].hasOwnProperty("fdr") && gGenes[0].fdr !== null;
            
            if (typeof loadSessions === "function") {
                loadSessions();
            }
            finalizeDataLoading();
        })
        .catch(err => {
            console.warn("api/genes 호출 실패, 업로드 직후 데이터로 렌더링을 진행합니다:", err);
            finalizeDataLoading();
        });
}

function resetOtherAnalysisViews() {
    // Reset GO Enrichment view
    const goTbody = document.getElementById("go-table-body");
    if (goTbody) {
        goTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">분석 실행 버튼을 누르시면 검정이 시작됩니다.</td></tr>';
    }
    const goChart = document.getElementById("go-chart-container");
    if (goChart) goChart.style.display = "none";
    
    // Reset Network view
    const cyNet = document.getElementById("cy-network");
    if (cyNet) cyNet.innerHTML = "";
    const netDetails = document.getElementById("network-node-details");
    if (netDetails) {
        netDetails.innerHTML = '<p class="text-center text-muted" style="margin-top: 100px;">네트워크에서 유전자 노드를 클릭하시면 상세 기능 설명이 여기에 표시됩니다.</p>';
    }
}

function finalizeDataLoading() {
    updateStatus("ready", "분석 완료");
    
    // Enable all analysis navigation tabs
    try {
        enableAnalysisTabs();
    } catch (e) {
        console.error("enableAnalysisTabs error:", e);
    }
    
    // Assign original order index for sort reset fallback
    gGenes.forEach((gene, index) => {
        gene.original_index = index;
    });
    
    window.gGenes = gGenes;
    
    // Update dynamic sample headers
    try {
        updateDEGTableHeaders();
    } catch (e) {
        console.error("updateDEGTableHeaders error:", e);
    }
    
    // Configure p-value filters visibility based on mode
    try {
        const pvalFilterGroup = document.getElementById("pvalue-filter-group");
        const heatmapMetricPvalue = document.getElementById("heatmap-metric-pvalue");
        const statTypeEl = document.getElementById("stat-type");
        const statType = statTypeEl ? statTypeEl.value : "fdr";
        const pvalInput = document.getElementById("pvalue-thresh");
        
        if (gIsReplicateMode) {
            if (pvalFilterGroup) pvalFilterGroup.style.display = "flex";
            if (pvalInput) {
                if (statType === "none") {
                    pvalInput.disabled = true;
                    pvalInput.style.opacity = "0.5";
                } else {
                    pvalInput.disabled = false;
                    pvalInput.style.opacity = "1.0";
                }
            }
            if (heatmapMetricPvalue) heatmapMetricPvalue.disabled = false;
            const titleEl = document.getElementById("plot-title-text");
            if (titleEl) titleEl.textContent = "Volcano Plot";
            const plotBtns = document.getElementById("plot-toggle-btns");
            if (plotBtns) plotBtns.style.display = "flex";
        } else {
            if (pvalFilterGroup) pvalFilterGroup.style.display = "none";
            if (heatmapMetricPvalue) heatmapMetricPvalue.disabled = true;
            const metricEl = document.getElementById("heatmap-metric");
            if (metricEl) metricEl.value = "log2fc";
            const titleEl = document.getElementById("plot-title-text");
            if (titleEl) titleEl.textContent = "MA Plot";
            const plotBtns = document.getElementById("plot-toggle-btns");
            if (plotBtns) plotBtns.style.display = "none";
        }
    } catch (e) {
        console.error("Filter configuration error:", e);
    }
    
    // 1. Populate DEG Table
    try {
        renderDEGTable();
    } catch (e) {
        console.error("renderDEGTable error:", e);
    }
    
    // 2. Refresh Volcano / MA Plot
    try {
        renderVolcanoOrMAPlot();
    } catch (e) {
        console.error("renderVolcanoOrMAPlot error:", e);
    }
    
    // 3. Fetch KEGG pathways list
    try {
        if (typeof fetchKEGGPathways === "function") fetchKEGGPathways();
    } catch (e) {
        console.error("fetchKEGGPathways error:", e);
    }
    
    // 4. Update Custom Pathway expression mapping
    try {
        if (typeof loadGSHPathwayData === "function") loadGSHPathwayData();
    } catch (e) {
        console.error("loadGSHPathwayData error:", e);
    }
    
    // 5. Trigger Heatmap and PCA refresh
    try {
        if (typeof renderHeatmap === "function") renderHeatmap();
    } catch (e) {
        console.error("renderHeatmap error:", e);
    }
    try {
        if (typeof renderPCAPlot === "function") renderPCAPlot();
    } catch (e) {
        console.error("renderPCAPlot error:", e);
    }
    
    // 6. Reset older mock states on secondary tabs to ensure clean data isolation
    try {
        resetOtherAnalysisViews();
    } catch (e) {
        console.error("resetOtherAnalysisViews error:", e);
    }
    
    // 7. Automatically switch to DEG result view
    try {
        switchTab("deg-tab");
    } catch (e) {
        console.error("switchTab error:", e);
    }
}

// ----------------------------------------------------------------------
// 3. DEG Table View
// ----------------------------------------------------------------------
function initControls() {
    const controls = ["log2fc-thresh", "pvalue-thresh", "search-gene"];
    controls.forEach(id => {
        document.getElementById(id).addEventListener("input", () => {
            renderDEGTable();
            renderVolcanoOrMAPlot();
        });
    });
    
    // Statistical significance criteria toggle
    document.getElementById("stat-type").addEventListener("change", () => {
        const statType = document.getElementById("stat-type").value;
        const pvalInput = document.getElementById("pvalue-thresh");
        if (statType === "none") {
            pvalInput.disabled = true;
            pvalInput.style.opacity = "0.5";
        } else {
            pvalInput.disabled = false;
            pvalInput.style.opacity = "1.0";
        }
        renderDEGTable();
        renderVolcanoOrMAPlot();
    });
    
    // Heatmap controls
    document.getElementById("regenerate-heatmap").addEventListener("click", renderHeatmap);
    
    const heatmapHeightInput = document.getElementById("heatmap-height");
    if (heatmapHeightInput) {
        heatmapHeightInput.addEventListener("input", (e) => {
            document.getElementById("heatmap-height-val").textContent = `${e.target.value}px`;
            renderHeatmap();
        });
    }
    
    const heatmapDendroGapInput = document.getElementById("heatmap-dendro-gap");
    if (heatmapDendroGapInput) {
        heatmapDendroGapInput.addEventListener("input", (e) => {
            document.getElementById("heatmap-dendro-gap-val").textContent = `${e.target.value}%`;
            renderHeatmap();
        });
    }
    
    const heatmapDendroGapTopInput = document.getElementById("heatmap-dendro-gap-top");
    if (heatmapDendroGapTopInput) {
        heatmapDendroGapTopInput.addEventListener("input", (e) => {
            document.getElementById("heatmap-dendro-gap-top-val").textContent = `${e.target.value}%`;
            renderHeatmap();
        });
    }
    

    
    // Sample order control event listeners
    const sampleOrderTypeSelect = document.getElementById("heatmap-sample-order-type");
    const sampleOrderCustomContainer = document.getElementById("sample-order-custom-container");
    const sampleOrderCustomInput = document.getElementById("heatmap-sample-order-custom");
    
    if (sampleOrderTypeSelect) {
        sampleOrderTypeSelect.addEventListener("change", (e) => {
            if (e.target.value === "custom") {
                sampleOrderCustomContainer.style.display = "block";
            } else {
                sampleOrderCustomContainer.style.display = "none";
            }
            renderHeatmap();
        });
    }
    
    if (sampleOrderCustomInput) {
        sampleOrderCustomInput.addEventListener("input", () => {
            renderHeatmap();
        });
    }
    
    // Clustering check change to enable/disable manual sample ordering
    const heatmapClusterCheck = document.getElementById("heatmap-cluster");
    if (heatmapClusterCheck) {
        // Run once on load to set initial state
        const toggleSampleOrderFields = () => {
            if (heatmapClusterCheck.checked) {
                if (sampleOrderTypeSelect) {
                    sampleOrderTypeSelect.disabled = true;
                    sampleOrderTypeSelect.style.opacity = "0.5";
                }
                sampleOrderCustomContainer.style.display = "none";
            } else {
                if (sampleOrderTypeSelect) {
                    sampleOrderTypeSelect.disabled = false;
                    sampleOrderTypeSelect.style.opacity = "1.0";
                    if (sampleOrderTypeSelect.value === "custom") {
                        sampleOrderCustomContainer.style.display = "block";
                    }
                }
            }
        };
        heatmapClusterCheck.addEventListener("change", () => {
            toggleSampleOrderFields();
            renderHeatmap();
        });
        // Attach initial hook invocation in case mock data finalization triggers
        document.addEventListener("DOMContentLoaded", toggleSampleOrderFields);
        // Let's also run this after data load finalization
    }
    
    // GO Enrichment & Inspector
    document.getElementById("run-go-btn").addEventListener("click", runGOEnrichment);
    
    const goInspectorSearch = document.getElementById("search-go-inspector-gene");
    if (goInspectorSearch) {
        goInspectorSearch.addEventListener("input", () => {
            renderGOInspectorTable();
        });
    }
    
    const goInspectorExport = document.getElementById("btn-export-go-genes");
    if (goInspectorExport) {
        goInspectorExport.addEventListener("click", () => {
            exportSelectedGOGenesToExcel();
        });
    }
    
    // PPI Network Controls & Excel Export
    const btnRebuildNet = document.getElementById("btn-rebuild-network");
    if (btnRebuildNet) {
        btnRebuildNet.addEventListener("click", renderNetworkGraph);
    }
    ["network-source", "network-type", "network-limit", "network-score"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("change", renderNetworkGraph);
        }
    });
    const netExportBtn = document.getElementById("btn-export-network-excel");
    if (netExportBtn) {
        netExportBtn.addEventListener("click", exportNetworkToExcel);
    }
    
    // Target Ego-Network Controls
    const btnRunTargetNet = document.getElementById("btn-run-target-network");
    const targetNetInput = document.getElementById("network-target-input");
    const btnNetClearTarget = document.getElementById("btn-net-clear-target");
    const btnResetNetView = document.getElementById("btn-reset-network-view");
    const netDepthSelect = document.getElementById("network-depth-select");

    if (btnRunTargetNet) {
        btnRunTargetNet.addEventListener("click", () => {
            const val = targetNetInput ? targetNetInput.value.trim() : "";
            gNetTargetGene = val || null;
            renderNetworkGraph();
        });
    }
    if (targetNetInput) {
        targetNetInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                gNetTargetGene = targetNetInput.value.trim() || null;
                renderNetworkGraph();
            }
        });
    }
    if (btnNetClearTarget) {
        btnNetClearTarget.addEventListener("click", resetNetworkTargetView);
    }
    if (btnResetNetView) {
        btnResetNetView.addEventListener("click", resetNetworkTargetView);
    }
    if (netDepthSelect) {
        netDepthSelect.addEventListener("change", () => {
            if (gNetTargetGene || (targetNetInput && targetNetInput.value.trim())) {
                renderNetworkGraph();
            }
        });
    }
    
    // Volcano Toggle buttons
    document.getElementById("btn-show-volcano").addEventListener("click", () => {
        document.getElementById("btn-show-volcano").classList.add("active");
        document.getElementById("btn-show-ma").classList.remove("active");
        renderPlot("volcano");
    });
    
    document.getElementById("btn-show-ma").addEventListener("click", () => {
        document.getElementById("btn-show-ma").classList.add("active");
        document.getElementById("btn-show-volcano").classList.remove("active");
        renderPlot("ma");
    });

    // Add sorting listeners for DEG table headers
    document.querySelectorAll(".sortable-header").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.getAttribute("data-sort-key");
            handleHeaderSort(key, th);
        });
    });

    // KEGG Pathway Gene Search Input Event
    const keggSearchInput = document.getElementById("kegg-search-gene");
    if (keggSearchInput) {
        keggSearchInput.addEventListener("input", (e) => {
            renderPathwayList(e.target.value);
        });
    }

    // DEG Excel Export Binding
    const btnExportExcel = document.getElementById("btn-export-deg-excel");
    if (btnExportExcel) {
        btnExportExcel.addEventListener("click", () => {
            window.open(`${API_URL}/api/export_deg_excel`, '_blank');
        });
    }
    
    // Volcano / MA Plot Export Bindings
    const btnExportVolcanoJpg = document.getElementById("btn-export-volcano-jpg");
    const btnExportVolcanoPdf = document.getElementById("btn-export-volcano-pdf");
    if (btnExportVolcanoJpg) {
        btnExportVolcanoJpg.addEventListener("click", () => exportPlotlyChart("plotly-chart", "jpeg", "yeast_volcano_ma_plot"));
    }
    if (btnExportVolcanoPdf) {
        btnExportVolcanoPdf.addEventListener("click", () => exportPlotlyChart("plotly-chart", "pdf", "yeast_volcano_ma_plot"));
    }
    
    // Heatmap Export Bindings
    const btnExportHeatmapJpg = document.getElementById("btn-export-heatmap-jpg");
    const btnExportHeatmapPdf = document.getElementById("btn-export-heatmap-pdf");
    if (btnExportHeatmapJpg) {
        btnExportHeatmapJpg.addEventListener("click", () => exportPlotlyChart("plotly-heatmap", "jpeg", "yeast_expression_heatmap"));
    }
    if (btnExportHeatmapPdf) {
        btnExportHeatmapPdf.addEventListener("click", () => exportPlotlyChart("plotly-heatmap", "pdf", "yeast_expression_heatmap"));
    }
    
    // PCA Plot Export Bindings
    const btnExportPcaJpg = document.getElementById("btn-export-pca-jpg");
    const btnExportPcaPdf = document.getElementById("btn-export-pca-pdf");
    if (btnExportPcaJpg) {
        btnExportPcaJpg.addEventListener("click", () => exportPlotlyChart("pca-scatter-chart", "jpeg", "yeast_pca_plot"));
    }
    if (btnExportPcaPdf) {
        btnExportPcaPdf.addEventListener("click", () => exportPlotlyChart("pca-scatter-chart", "pdf", "yeast_pca_plot"));
    }
    
    // GO Enrichment Export Bindings
    const btnExportGoJpg = document.getElementById("btn-export-go-jpg");
    const btnExportGoPdf = document.getElementById("btn-export-go-pdf");
    if (btnExportGoJpg) {
        btnExportGoJpg.addEventListener("click", () => exportPlotlyChart("go-bar-chart", "jpeg", "yeast_go_enrichment_chart"));
    }
    if (btnExportGoPdf) {
        btnExportGoPdf.addEventListener("click", () => exportPlotlyChart("go-bar-chart", "pdf", "yeast_go_enrichment_chart"));
    }
    
    // KEGG Map Export Bindings
    const btnExportKeggJpg = document.getElementById("btn-export-kegg-jpg");
    const btnExportKeggPdf = document.getElementById("btn-export-kegg-pdf");
    if (btnExportKeggJpg) {
        btnExportKeggJpg.addEventListener("click", () => exportKeggMap("jpeg", "yeast_kegg_pathway_map"));
    }
    if (btnExportKeggPdf) {
        btnExportKeggPdf.addEventListener("click", () => exportKeggMap("pdf", "yeast_kegg_pathway_map"));
    }
    
    // ------------------------------------------------------------------
    // Gene Detail Modal Bindings
    // ------------------------------------------------------------------
    const closeModalBtn = document.getElementById("close-modal");
    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", () => {
            document.getElementById("gene-modal").style.display = "none";
        });
    }
    window.addEventListener("click", (event) => {
        const modal = document.getElementById("gene-modal");
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });

    // ------------------------------------------------------------------
    // Transcription Factor & STRING Network Toggle Bindings
    // ------------------------------------------------------------------
    const btnNetString = document.getElementById("btn-net-mode-string");
    const btnNetTF = document.getElementById("btn-net-mode-tf");
    const stringControls = document.getElementById("string-controls-wrapper");
    const subtabTFList = document.getElementById("btn-subtab-tflist");
    
    if (btnNetString && btnNetTF) {
        btnNetString.addEventListener("click", () => {
            btnNetString.classList.add("active");
            btnNetTF.classList.remove("active");
            document.getElementById("network-tab-title").textContent = "STRING-DB 단백질 상호작용 네트워크";
            if (stringControls) stringControls.style.display = "flex";
            if (subtabTFList) subtabTFList.style.display = "none";
            
            // Switch back to details subtab
            document.getElementById("btn-subtab-node").click();
            
            gNetworkMode = 'string';
            renderNetworkGraph();
        });
        
        btnNetTF.addEventListener("click", () => {
            btnNetTF.classList.add("active");
            btnNetString.classList.remove("active");
            document.getElementById("network-tab-title").textContent = "전사조절 (TF-Target) 네트워크 분석";
            if (stringControls) stringControls.style.display = "none";
            if (subtabTFList) subtabTFList.style.display = "block";
            
            // Switch to TF List subtab by default for TF mode
            if (subtabTFList) subtabTFList.click();
            
            gNetworkMode = 'tf';
            renderNetworkGraph();
        });
    }
    
    // Network Side Bar Subtabs Toggle Bindings
    const btnSubtabNode = document.getElementById("btn-subtab-node");
    const btnSubtabTFList = document.getElementById("btn-subtab-tflist");
    const nodeDetailsArea = document.getElementById("network-node-details");
    const tfListArea = document.getElementById("network-tf-list-container");
    
    if (btnSubtabNode && btnSubtabTFList) {
        btnSubtabNode.addEventListener("click", () => {
            btnSubtabNode.classList.add("active");
            btnSubtabNode.style.color = "var(--primary-color)";
            btnSubtabNode.style.borderBottom = "2px solid var(--primary-color)";
            
            btnSubtabTFList.classList.remove("active");
            btnSubtabTFList.style.color = "var(--text-muted)";
            btnSubtabTFList.style.borderBottom = "none";
            
            if (nodeDetailsArea) nodeDetailsArea.style.display = "block";
            if (tfListArea) tfListArea.style.display = "none";
        });
        
        btnSubtabTFList.addEventListener("click", () => {
            btnSubtabTFList.classList.add("active");
            btnSubtabTFList.style.color = "var(--primary-color)";
            btnSubtabTFList.style.borderBottom = "2px solid var(--primary-color)";
            
            btnSubtabNode.classList.remove("active");
            btnSubtabNode.style.color = "var(--text-muted)";
            btnSubtabNode.style.borderBottom = "none";
            
            if (nodeDetailsArea) nodeDetailsArea.style.display = "none";
            if (tfListArea) tfListArea.style.display = "block";
        });
    }
    
    // Rebuild Network Button
    const btnRebuild = document.getElementById("btn-rebuild-network");
    if (btnRebuild) {
        btnRebuild.addEventListener("click", () => {
            renderNetworkGraph();
        });
    }

    // ------------------------------------------------------------------
    // Motif Discovery Bindings
    // ------------------------------------------------------------------
    const btnRunMotif = document.getElementById("btn-run-motif");
    if (btnRunMotif) {
        btnRunMotif.addEventListener("click", () => {
            runMotifAnalysis();
        });
    }
    const btnExportMotifJpg = document.getElementById("btn-export-motif-jpg");
    const btnExportMotifPdf = document.getElementById("btn-export-motif-pdf");
    if (btnExportMotifJpg) {
        btnExportMotifJpg.addEventListener("click", () => exportPlotlyChart("motif-logo-chart", "jpeg", "yeast_motif_logo"));
    }
    if (btnExportMotifPdf) {
        btnExportMotifPdf.addEventListener("click", () => exportPlotlyChart("motif-logo-chart", "pdf", "yeast_motif_logo"));
    }
    
    // Custom GSH Pathway Refresh Binding
    const btnRefreshGsh = document.getElementById("btn-refresh-gsh-pathway");
    if (btnRefreshGsh) {
        btnRefreshGsh.addEventListener("click", loadGSHPathwayData);
    }
}

function handleHeaderSort(key, thEl) {
    if (gCurrentSortKey === key) {
        // Toggle: none -> asc -> desc -> none
        if (gCurrentSortOrder === 'none') gCurrentSortOrder = 'asc';
        else if (gCurrentSortOrder === 'asc') gCurrentSortOrder = 'desc';
        else gCurrentSortOrder = 'none';
    } else {
        gCurrentSortKey = key;
        gCurrentSortOrder = 'asc';
    }
    
    // Reset all headers state
    document.querySelectorAll(".sortable-header").forEach(th => {
        th.classList.remove("active-sort");
        const icon = th.querySelector(".sort-icon");
        if (icon) {
            icon.className = "fa-solid fa-sort sort-icon";
        }
    });
    
    // Set active header state
    if (gCurrentSortOrder !== 'none') {
        thEl.classList.add("active-sort");
        const icon = thEl.querySelector(".sort-icon");
        if (icon) {
            if (gCurrentSortOrder === 'asc') {
                icon.className = "fa-solid fa-sort-up sort-icon";
            } else {
                icon.className = "fa-solid fa-sort-down sort-icon";
            }
        }
    }
    
    renderDEGTable();
}

function renderDEGTable() {
    const log2fcThresh = parseFloat(document.getElementById("log2fc-thresh").value) || 0;
    const pvalThresh = parseFloat(document.getElementById("pvalue-thresh").value) || 1.0;
    const searchVal = document.getElementById("search-gene").value.toLowerCase();
    
    const tbody = document.getElementById("deg-table-body");
    tbody.innerHTML = "";
    
    let upCount = 0;
    let downCount = 0;
    let filteredCount = 0;
    const statType = document.getElementById("stat-type") ? document.getElementById("stat-type").value : "fdr";
    
    // Sort logic
    let sortedGenes = [...gGenes];
    if (gCurrentSortKey && gCurrentSortOrder !== 'none') {
        const key = gCurrentSortKey;
        const order = gCurrentSortOrder === 'asc' ? 1 : -1;
        
        sortedGenes.sort((a, b) => {
            let valA, valB;
            
            if (key === "classification") {
                const getClassification = (gene) => {
                    const statVal = statType === "fdr" ? gene.fdr : gene.pvalue;
                    const passesLog2FC = Math.abs(gene.log2fc) >= log2fcThresh;
                    let passesPVal = true;
                    if (statType !== "none" && gIsReplicateMode) {
                        passesPVal = (statVal !== null && statVal <= pvalThresh);
                    }
                    if (passesLog2FC && passesPVal) {
                        if (gene.log2fc >= log2fcThresh) return "Upregulated";
                        if (gene.log2fc <= -log2fcThresh) return "Downregulated";
                    }
                    return "Neutral";
                };
                valA = getClassification(a);
                valB = getClassification(b);
            } else {
                valA = a[key];
                valB = b[key];
            }
            
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;
            
            if (typeof valA === "string") {
                return order * valA.localeCompare(valB);
            } else {
                return order * (valA - valB);
            }
        });
    } else {
        // Fallback to original order
        sortedGenes.sort((a, b) => (a.original_index || 0) - (b.original_index || 0));
    }
    
    sortedGenes.forEach(gene => {
        const symbol = gene.gene_symbol.toLowerCase();
        const locus = gene.locus_tag.toLowerCase();
        
        // Search filter
        if (searchVal && !symbol.includes(searchVal) && !locus.includes(searchVal)) {
            return;
        }
        
        // Determine DEG classification
        let classification = "Neutral";
        let classClass = "";
        
        const statVal = statType === "fdr" ? gene.fdr : gene.pvalue;
        
        const passesLog2FC = Math.abs(gene.log2fc) >= log2fcThresh;
        let passesPVal = true;
        if (statType !== "none" && gIsReplicateMode) {
            passesPVal = (statVal !== null && statVal <= pvalThresh);
        }
        
        if (passesLog2FC && passesPVal) {
            if (gene.log2fc >= log2fcThresh) {
                classification = "Upregulated";
                classClass = "up-text";
                upCount++;
            } else if (gene.log2fc <= -log2fcThresh) {
                classification = "Downregulated";
                classClass = "down-text";
                downCount++;
            }
        }
        
        filteredCount++;
        
        // Append row
        const row = document.createElement("tr");
        if (gSelectedGene && gSelectedGene.locus_tag === gene.locus_tag) {
            row.classList.add("selected");
        }
        
        row.innerHTML = `
            <td><code>${gene.locus_tag}</code></td>
            <td><strong>${gene.gene_symbol}</strong></td>
            <td>${gene.wt_val}</td>
            <td>${gene.mutant_val}</td>
            <td class="${gene.log2fc >= 0 ? 'up-text' : 'down-text'}">${gene.log2fc > 0 ? '+' : ''}${gene.log2fc}</td>
            <td>${gene.pvalue !== null ? gene.pvalue : '-'}</td>
            <td>${gene.fdr !== null ? gene.fdr : '-'}</td>
            <td class="${classClass}">${classification}</td>
            <td class="text-muted" title="${gene.description}">${gene.description.length > 50 ? gene.description.substring(0, 50) + "..." : gene.description}</td>
        `;
        
        row.addEventListener("click", () => {
            // Highlight row
            document.querySelectorAll("#deg-table tr").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");
            
            // Show detail panel
            showGeneDetails(gene);
        });
        
        tbody.appendChild(row);
    });
    
    // Update badges
    document.getElementById("stat-up-count").textContent = upCount;
    document.getElementById("stat-down-count").textContent = downCount;
    document.getElementById("stat-total-count").textContent = gGenes.length;
}

// ----------------------------------------------------------------------
// 4. Volcano / MA Plot Redrawing
// ----------------------------------------------------------------------
function renderVolcanoOrMAPlot() {
    const showVolcano = gIsReplicateMode && document.getElementById("btn-show-volcano").classList.contains("active");
    renderPlot(showVolcano ? "volcano" : "ma");
}

function renderPlot(plotType) {
    const log2fcThresh = parseFloat(document.getElementById("log2fc-thresh").value) || 0;
    const rawPvalThresh = document.getElementById("pvalue-thresh") ? parseFloat(document.getElementById("pvalue-thresh").value) : 0.05;
    const pvalThresh = isNaN(rawPvalThresh) ? 0.05 : rawPvalThresh;
    const statType = document.getElementById("stat-type") ? document.getElementById("stat-type").value : "fdr";
    
    const xData = [];
    const yData = [];
    const textData = [];
    const colorData = [];
    const customData = [];
    
    let topDegCandidates = [];
    
    gGenes.forEach(gene => {
        const statVal = statType === "fdr" ? gene.fdr : gene.pvalue;
        let passesPVal = true;
        if (statType !== "none" && gIsReplicateMode) {
            passesPVal = (statVal !== null && statVal !== undefined && !isNaN(statVal) && statVal <= pvalThresh);
        }
        const isUp = gene.log2fc >= log2fcThresh && passesPVal;
        const isDown = gene.log2fc <= -log2fcThresh && passesPVal;
        
        let color = '#94a3b8'; // Neutral (Gray)
        if (isUp) color = '#ef4444'; // Upregulated DEG (Bright Red)
        if (isDown) color = '#3b82f6'; // Downregulated DEG (Bright Blue)
        
        let yVal = 0;
        if (plotType === "volcano") {
            xData.push(gene.log2fc);
            const yStatVal = statType === "none" ? (gene.fdr || gene.pvalue) : statVal;
            yVal = (yStatVal !== null && yStatVal !== undefined && yStatVal > 0) ? -Math.log10(yStatVal) : 0;
            yData.push(yVal);
        } else {
            const meanExpr = (gene.wt_val + gene.mutant_val) / 2;
            const xVal = meanExpr > 0 ? Math.log2(meanExpr) : 0;
            xData.push(xVal);
            yData.push(gene.log2fc);
            yVal = Math.abs(gene.log2fc);
        }
        
        if (passesPVal && (isUp || isDown)) {
            topDegCandidates.push({
                gene: gene,
                symbol: gene.gene_symbol || gene.locus_tag,
                x: plotType === "volcano" ? gene.log2fc : (Math.log2(((gene.wt_val + gene.mutant_val) / 2) || 1)),
                y: yVal,
                score: yVal * Math.abs(gene.log2fc)
            });
        }
        
        const statLabel = statType === "fdr" ? "FDR" : "p-value";
        textData.push(`${gene.gene_symbol} (${gene.locus_tag})<br>Log2FC: ${gene.log2fc}<br>${statLabel}: ${statVal !== null ? statVal : '-'}`);
        colorData.push(color);
        customData.push(gene);
    });
    
    // Sort top DEGs by significance score for auto-annotations
    topDegCandidates.sort((a, b) => b.score - a.score);
    const topDegsToAnnotate = topDegCandidates.slice(0, 8);
    
    const markerSize = gGenes.length > 2000 ? 5 : 6;
    
    const trace = {
        x: xData,
        y: yData,
        mode: 'markers',
        type: 'scattergl',
        text: textData,
        marker: {
            size: markerSize,
            color: colorData,
            opacity: 0.55,
            line: {
                color: 'rgba(255,255,255,0.3)',
                width: 0.3
            }
        },
        customdata: customData
    };
    
    const annotations = topDegsToAnnotate.map(item => ({
        x: item.x,
        y: item.y,
        text: item.symbol,
        showarrow: true,
        arrowhead: 2,
        arrowsize: 0.8,
        arrowwidth: 1,
        arrowcolor: '#475569',
        ax: item.x > 0 ? 25 : -25,
        ay: -20,
        font: {
            family: 'Inter, sans-serif',
            size: 11,
            color: '#0f172a'
        },
        bgcolor: 'rgba(255,255,255,0.85)',
        bordercolor: '#cbd5e1',
        borderwidth: 1,
        borderpad: 2
    }));
    
    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: {
            color: '#0f172a',
            family: 'Inter, sans-serif'
        },
        xaxis: {
            title: plotType === "volcano" ? 'Log2 Fold Change' : 'Log2 Mean Expression (TPM)',
            gridcolor: '#e2e8f0',
            zerolinecolor: '#cbd5e1'
        },
        yaxis: {
            title: plotType === "volcano" ? (statType === "fdr" || statType === "none" ? '-Log10(FDR)' : '-Log10(p-value)') : 'Log2 Fold Change',
            gridcolor: '#e2e8f0',
            zerolinecolor: '#cbd5e1'
        },
        margin: { t: 25, r: 25, b: 65, l: 60 },
        hovermode: 'closest',
        annotations: annotations,
        shapes: []
    };
    
    // Add thresh lines
    if (plotType === "volcano") {
        const maxY = yData.length > 0 ? Math.max(...yData) : 5;
        const maxX = xData.length > 0 ? Math.max(...xData.map(Math.abs)) : 3;
        layout.shapes.push(
            // Vertical -thresh line
            {
                type: 'line',
                x0: -log2fcThresh, x1: -log2fcThresh,
                y0: 0, y1: maxY * 1.05,
                line: { color: 'rgba(15, 23, 42, 0.35)', width: 1, dash: 'dash' }
            },
            // Vertical +thresh line
            {
                type: 'line',
                x0: log2fcThresh, x1: log2fcThresh,
                y0: 0, y1: maxY * 1.05,
                line: { color: 'rgba(15, 23, 42, 0.35)', width: 1, dash: 'dash' }
            }
        );
        if (gIsReplicateMode && statType !== "none" && pvalThresh > 0 && pvalThresh <= 1.0) {
            const hVal = -Math.log10(pvalThresh);
            layout.shapes.push(
                // Horizontal FDR line
                {
                    type: 'line',
                    x0: -maxX * 1.1, x1: maxX * 1.1,
                    y0: hVal, y1: hVal,
                    line: { color: 'rgba(15, 23, 42, 0.35)', width: 1, dash: 'dash' }
                }
            );
        }
    } else {
        // MA Plot thresholds
        layout.shapes.push(
            {
                type: 'line',
                x0: 0, x1: Math.max(...xData) * 1.05,
                y0: log2fcThresh, y1: log2fcThresh,
                line: { color: 'rgba(15, 23, 42, 0.25)', width: 1, dash: 'dash' }
            },
            {
                type: 'line',
                x0: 0, x1: Math.max(...xData) * 1.05,
                y0: -log2fcThresh, y1: -log2fcThresh,
                line: { color: 'rgba(15, 23, 42, 0.25)', width: 1, dash: 'dash' }
            }
        );
    }
    
    Plotly.newPlot('plotly-chart', [trace], layout, {responsive: true});
    
    // Register click event
    const plotEl = document.getElementById('plotly-chart');
    plotEl.on('plotly_click', (data) => {
        if (data.points && data.points[0]) {
            const gene = data.points[0].customdata;
            showGeneDetails(gene);
        }
    });
}

// Helper to generate species-specific UniProt DB link URL
function getUniprotUrl(gene) {
    if (!gene) return "https://www.uniprot.org";
    let locus = gene.locus_tag || gene.gene_symbol || (typeof gene === 'string' ? gene : "");
    let symbol = gene.gene_symbol || locus;
    
    // For C. glutamicum, UniProtKB indexes using Cgl prefix (e.g. Cgl1206) instead of NCBI NCgl prefix (e.g. NCgl1206)
    if (gCurrentSpecies === "cgl" && locus) {
        if (/^NCgl/i.test(locus)) {
            locus = locus.replace(/^NCgl/i, "Cgl");
        } else if (/^cg/i.test(locus) && !/^Cgl/i.test(locus)) {
            locus = locus.replace(/^cg/i, "Cgl");
        }
    }
    
    const query = locus || symbol;
    
    let taxId = "";
    if (gCurrentSpecies === "cgl") taxId = "196627";
    else if (gCurrentSpecies === "eco") taxId = "83333";
    else if (gCurrentSpecies === "sce") taxId = "559292";
    
    if (taxId) {
        return `https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(query)}+AND+taxonomy_id:${taxId}`;
    }
    return `https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(query)}`;
}

// ----------------------------------------------------------------------
// 5. Gene Detail Panel
// ----------------------------------------------------------------------
function showGeneDetails(gene) {
    gSelectedGene = gene;
    const uniprotUrl = getUniprotUrl(gene);
    
    const panel = document.getElementById("gene-detail-body");
    panel.innerHTML = `
        <div class="gene-detail-card">
            <div class="gene-detail-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="gene-detail-title">${gene.gene_symbol}</span>
                    <span class="gene-detail-locus">${gene.locus_tag}</span>
                </div>
                <a href="${uniprotUrl}" target="_blank" rel="noopener noreferrer" class="uniprot-badge-btn" title="UniProt에서 ${gene.gene_symbol || gene.locus_tag} 단백질 3D 구조 및 상세 정보 보기">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> UniProt DB
                </a>
            </div>
            <p class="gene-detail-desc">${gene.description || '유전자 설명이 존재하지 않습니다.'}</p>
            
            <div class="gene-detail-grid">
                <div class="detail-item">
                    <span class="detail-lbl">WT 평균 발현량</span>
                    <span class="detail-val">${gene.wt_val}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-lbl">Mutant 평균 발현량</span>
                    <span class="detail-val">${gene.mutant_val}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-lbl">Log2 Fold Change</span>
                    <span class="detail-val ${gene.log2fc >= 0 ? 'up-text' : 'down-text'}">${gene.log2fc}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-lbl">FDR (Adjusted P-val)</span>
                    <span class="detail-val">${gene.fdr !== null ? gene.fdr : '-'}</span>
                </div>
            </div>
            
            <div id="plotly-bar-detail" style="height: 250px; width: 100%;"></div>
        </div>
    `;
    
    // Render detail WT vs Mutant bar chart
    renderDetailChart(gene);
    
    // If we clicked from DEG table, we should also navigate to Volcano tab to show the detail side panel
    if (gActiveTab !== 'volcano-tab') {
        switchTab('volcano-tab');
    }
}

// Global IGV Browser instance holder
let gIgvBrowserInstance = null;

function openGeneIGVModal(gene) {
    const modal = document.getElementById("gene-modal");
    if (!modal) return;
    
    document.getElementById("modal-gene-title").textContent = `${gene.gene_symbol} (${gene.locus_tag})`;
    document.getElementById("modal-gene-desc").textContent = gene.description || '유전자 설명이 존재하지 않습니다.';
    
    modal.style.display = "flex";
    
    // Bind Close events
    const closeBtn = document.getElementById("close-modal");
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = "none";
        };
    }
    window.onclick = (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    };
    
    // Render a copy of the bar chart inside the modal
    setTimeout(() => {
        let trace1, trace2;
        if (gIsReplicateMode && gene.wt_reps && gene.mut_reps) {
            trace1 = {
                x: ['WT', 'Mutant'],
                y: [gene.wt_val, gene.mutant_val],
                type: 'bar',
                name: '평균값',
                marker: { color: ['rgba(99, 102, 241, 0.4)', 'rgba(239, 68, 68, 0.4)'] }
            };
            const repX = [];
            const repY = [];
            gene.wt_reps.forEach(v => { repX.push('WT'); repY.push(v); });
            gene.mut_reps.forEach(v => { repX.push('Mutant'); repY.push(v); });
            trace2 = {
                x: repX,
                y: repY,
                mode: 'markers',
                type: 'scatter',
                name: '반복구',
                marker: { size: 10, color: ['#6366f1', '#6366f1', '#6366f1', '#ff4d4d', '#ff4d4d', '#ff4d4d'], opacity: 0.9 }
            };
        } else {
            trace1 = {
                x: ['WT', 'Mutant'],
                y: [gene.wt_val, gene.mutant_val],
                type: 'bar',
                marker: { color: ['#6366f1', '#ff4d4d'] }
            };
        }
        const layout = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#0f172a', family: 'Inter, sans-serif' },
            xaxis: { gridcolor: '#e2e8f0' },
            yaxis: { title: 'Expression Value', gridcolor: '#e2e8f0' },
            margin: { t: 20, r: 10, b: 30, l: 50 },
            showlegend: false,
            height: 220
        };
        Plotly.newPlot('modal-chart', trace2 ? [trace1, trace2] : [trace1], layout, {responsive: true});
    }, 100);
}

function renderDetailChart(gene) {
    let trace1, trace2;
    
    if (gIsReplicateMode && gene.wt_reps && gene.mut_reps) {
        // Show replicates as bar + scatter points
        trace1 = {
            x: ['WT', 'Mutant'],
            y: [gene.wt_val, gene.mutant_val],
            type: 'bar',
            name: '평균값',
            marker: { color: ['rgba(59, 130, 246, 0.4)', 'rgba(239, 68, 68, 0.4)'] }
        };
        
        // Replicate dots
        const repX = [];
        const repY = [];
        gene.wt_reps.forEach(v => { repX.push('WT'); repY.push(v); });
        gene.mut_reps.forEach(v => { repX.push('Mutant'); repY.push(v); });
        
        trace2 = {
            x: repX,
            y: repY,
            mode: 'markers',
            type: 'scatter',
            name: '반복구',
            marker: { size: 10, color: ['#3b82f6', '#3b82f6', '#3b82f6', '#ff4d4d', '#ff4d4d', '#ff4d4d'], opacity: 0.9 }
        };
    } else {
        // Average mode, show simple bar
        trace1 = {
            x: ['WT', 'Mutant'],
            y: [gene.wt_val, gene.mutant_val],
            type: 'bar',
            marker: { color: ['#3b82f6', '#ff4d4d'] }
        };
    }
    
    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: {
            color: '#0f172a',
            family: 'Inter, sans-serif'
        },
        xaxis: {
            gridcolor: '#e2e8f0'
        },
        yaxis: {
            title: 'Expression (TPM/FPKM)',
            gridcolor: '#e2e8f0'
        },
        margin: { t: 20, r: 10, b: 30, l: 50 },
        showlegend: false
    };
    
    const data = trace2 ? [trace1, trace2] : [trace1];
    Plotly.newPlot('plotly-bar-detail', data, layout, {responsive: true});
}

// ----------------------------------------------------------------------
// 6. Heatmap View
// ----------------------------------------------------------------------
function renderHeatmap() {
    if (gGenes.length === 0) return;
    
    const count = parseInt(document.getElementById("heatmap-count").value);
    const metric = document.getElementById("heatmap-metric").value;
    const applyClustering = document.getElementById("heatmap-cluster").checked;
    const chartDiv = document.getElementById("plotly-heatmap");
    
    const heightInput = document.getElementById("heatmap-height");
    const heatmapHeight = heightInput ? parseInt(heightInput.value) : 600;
    if (chartDiv) {
        chartDiv.style.height = `${heatmapHeight}px`;
    }
    
    const gapInput = document.getElementById("heatmap-dendro-gap");
    const gapRatio = gapInput ? parseFloat(gapInput.value) / 100.0 : 0.02;
    
    const gapTopInput = document.getElementById("heatmap-dendro-gap-top");
    const gapRatioTop = gapTopInput ? parseFloat(gapTopInput.value) / 100.0 : 0.01;
    
    if (!applyClustering) {
        // Simple mock hierarchical clustering for layout (Local mode)
        let sorted = [...gGenes];
        if (metric === "log2fc") {
            sorted.sort((a, b) => Math.abs(b.log2fc) - Math.abs(a.log2fc));
        } else {
            sorted = sorted.filter(g => g.fdr !== null);
            sorted.sort((a, b) => a.fdr - b.fdr);
        }
        
        const topGenes = sorted.slice(0, count);
        
        const yLabels = [];
        const zDataWT = [];
        const zDataMutant = [];
        
        topGenes.forEach(gene => {
            yLabels.push(`${gene.gene_symbol} (${gene.locus_tag})`);
            let wtVals = [gene.wt_val];
            let mutVals = [gene.mutant_val];
            if (gIsReplicateMode && gene.wt_reps && gene.mut_reps) {
                wtVals = gene.wt_reps;
                mutVals = gene.mut_reps;
            }
            
            const allVals = [...wtVals, ...mutVals];
            const mean = npMean(allVals);
            const std = npStd(allVals) || 1.0;
            
            zDataWT.push(wtVals.map(v => (v - mean) / std));
            zDataMutant.push(mutVals.map(v => (v - mean) / std));
        });
        
        let wtCount = zDataWT[0].length;
        let mutCount = zDataMutant[0].length;
        
        // 1. Build original sample candidates map
        const samplesList = [];
        for (let i = 0; i < wtCount; i++) {
            samplesList.push({ name: wtCount > 1 ? `WT_Rep${i+1}` : 'WT', type: 'wt', localIdx: i });
        }
        for (let i = 0; i < mutCount; i++) {
            samplesList.push({ name: mutCount > 1 ? `Mutant_Rep${i+1}` : 'Mutant', type: 'mutant', localIdx: i });
        }
        
        // 2. Perform sorting logic based on dropdown choices
        const orderTypeSelect = document.getElementById("heatmap-sample-order-type");
        const orderType = orderTypeSelect ? orderTypeSelect.value : "wt-mutant";
        
        let orderedSamples = [];
        if (orderType === "wt-mutant") {
            orderedSamples = [...samplesList];
        } else if (orderType === "mutant-wt") {
            orderedSamples = [
                ...samplesList.filter(s => s.type === 'mutant'),
                ...samplesList.filter(s => s.type === 'wt')
            ];
        } else if (orderType === "custom") {
            const customInput = document.getElementById("heatmap-sample-order-custom");
            const customVal = customInput ? customInput.value : "";
            const customNames = customVal.split(",").map(s => s.trim().toUpperCase()).filter(s => s !== "");
            
            customNames.forEach(cName => {
                const found = samplesList.find(s => s.name.toUpperCase() === cName);
                if (found && !orderedSamples.includes(found)) {
                    orderedSamples.push(found);
                }
            });
            
            // Append missing samples safely to prevent data loss
            samplesList.forEach(s => {
                if (!orderedSamples.includes(s)) {
                    orderedSamples.push(s);
                }
            });
        } else {
            orderedSamples = [...samplesList];
        }
        
        // 3. Assemble xLabels and zDataMatrix with the reordered samples
        const xLabels = orderedSamples.map(s => s.name);
        const zDataMatrix = [];
        
        for (let r = 0; r < yLabels.length; r++) {
            const rowWT = zDataWT[r];
            const rowMutant = zDataMutant[r];
            const reorderedRow = orderedSamples.map(s => {
                return s.type === 'wt' ? rowWT[s.localIdx] : rowMutant[s.localIdx];
            });
            zDataMatrix.push(reorderedRow);
        }
        
        const trace = {
            z: zDataMatrix,
            x: xLabels,
            y: yLabels,
            type: 'heatmap',
            colorscale: [
                [0, '#0000ff'],      // Deep Blue
                [0.5, '#ffffff'],    // White
                [1, '#ff0000']       // Deep Red
            ],
            colorbar: {
                title: 'Z-score',
                titleside: 'right'
            },
            hoverongaps: false
        };
        
        const layout = {
            height: heatmapHeight,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#0f172a', family: 'Inter, sans-serif' },
            margin: { t: 50, r: 20, b: 40, l: 150 },
            xaxis: { side: 'top', tickangle: -45 },
            yaxis: { autorange: 'reversed', showgrid: false }
        };
        
        Plotly.newPlot('plotly-heatmap', [trace], layout, {responsive: true});
    } else {
        // Advanced Hierarchical Clustering with Dendrograms (Server mode)
        chartDiv.innerHTML = `<div style="text-align: center; padding-top: 150px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top: 10px;">이차원 계층 클러스터링(Heatmap & Dendrogram) 연산 중...</p></div>`;
        
        // Extract top genes based on criteria
        let sorted = [...gGenes];
        if (metric === "log2fc") {
            sorted.sort((a, b) => Math.abs(b.log2fc) - Math.abs(a.log2fc));
        } else {
            sorted = sorted.filter(g => g.fdr !== null);
            sorted.sort((a, b) => a.fdr - b.fdr);
        }
        const topGenes = sorted.slice(0, count);
        const geneLocusTags = topGenes.map(g => g.locus_tag);

        fetch(`${API_URL}/api/cluster_heatmap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                genes: geneLocusTags,
                count: count,
                metric: metric,
                species: gCurrentSpecies,
                session_id: gActiveSessionId
            })
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                chartDiv.innerHTML = `<div class="text-center text-danger" style="padding-top: 150px;">클러스터링 연산 실패: ${data.detail}</div>`;
                return;
            }
            
            const xLabels = data.x_labels || [];
            const yLabels = data.y_labels || [];
            const zMatrix = data.expression_matrix || [];
            const geneDendro = data.gene_dendrogram;
            const sampleDendro = data.sample_dendrogram;
            
            const traces = [];
            
            // Generate index arrays for linear scale matching
            const xIndices = xLabels.map((_, i) => i);
            const yIndices = yLabels.map((_, i) => i);
            
            // 1. Heatmap Trace
            const heatmapTrace = {
                z: zMatrix,
                x: xIndices,
                y: yIndices,
                type: 'heatmap',
                xaxis: 'x',
                yaxis: 'y',
                colorscale: [
                    [0, '#0000ff'],
                    [0.5, '#ffffff'],
                    [1, '#ff0000']
                ],
                colorbar: {
                    title: 'Z-score',
                    titleside: 'right',
                    len: 0.8,
                    y: 0.4
                },
                hoverongaps: false
            };
            traces.push(heatmapTrace);
            
            // 2. Gene Dendrogram Trace (Y-axis hierarchy)
            if (geneDendro && geneDendro.x && geneDendro.x.length > 0) {
                const gdX = [];
                const gdY = [];
                geneDendro.x.forEach((xs, idx) => {
                    const ys = geneDendro.y[idx];
                    gdX.push(...xs, null);
                    gdY.push(...ys, null);
                });
                
                const geneDendroTrace = {
                    x: gdX,
                    y: gdY,
                    type: 'scatter',
                    mode: 'lines',
                    xaxis: 'x2',
                    yaxis: 'y',
                    line: { color: '#475569', width: 1.5 },
                    hoverinfo: 'none',
                    showlegend: false
                };
                traces.push(geneDendroTrace);
            }
            
            // 3. Sample Dendrogram Trace (X-axis hierarchy)
            if (sampleDendro && sampleDendro.x && sampleDendro.x.length > 0) {
                const sdX = [];
                const sdY = [];
                sampleDendro.x.forEach((xs, idx) => {
                    const ys = sampleDendro.y[idx];
                    sdX.push(...xs, null);
                    sdY.push(...ys, null);
                });
                
                const sampleDendroTrace = {
                    x: sdX,
                    y: sdY,
                    type: 'scatter',
                    mode: 'lines',
                    xaxis: 'x3',
                    yaxis: 'y2',
                    line: { color: '#475569', width: 1.5 },
                    hoverinfo: 'none',
                    showlegend: false
                };
                traces.push(sampleDendroTrace);
            }
            
            // Calculate dynamic margins and domain boundaries
            const gap = gapRatio;
            
            // X-axis layouts:
            const xHeatmapStart = 0.24;
            const xGeneDendroEnd = Math.max(0.0, xHeatmapStart - gap);
            
            // Y-axis layouts:
            // 1) Heatmap matrix: [0.0, yHeatmapEnd] -> Sample names attach directly at yHeatmapEnd
            // 2) Blank Clearance Gap: 65px (45px rotated text height + 20px clean blank gap)
            // 3) Sample dendrogram tree: [ySampleDendroStart, 1.0] -> 75px fixed tree height
            const marginT = 30;
            const marginB = 40;
            const availablePlotHeight = Math.max(150, heatmapHeight - marginT - marginB);
            
            const sampleTextClearancePx = 65; // 45px text height + 20px clean open gap
            const dendroTreePx = 75;          // 75px top dendrogram tree height
            const userGapPx = (gapRatioTop * 100) * 1.5;
            
            const sampleTextFraction = Math.min(0.25, sampleTextClearancePx / availablePlotHeight);
            const dendroTreeFraction = Math.min(0.35, dendroTreePx / availablePlotHeight);
            const gapFraction = userGapPx / availablePlotHeight;
            
            const totalTopFraction = sampleTextFraction + dendroTreeFraction + gapFraction;
            const yHeatmapEnd = Math.max(0.35, 1.0 - totalTopFraction);
            const ySampleDendroStart = Math.min(0.99, yHeatmapEnd + sampleTextFraction + gapFraction);

            // Calculate exact X and Y axis coordinate bounds for 1:1 pixel alignment
            const numSamples = xLabels.length;
            const numGenes = yLabels.length;
            const xMin = -0.5;
            const xMax = numSamples - 0.5;

            const layout = {
                height: heatmapHeight,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#0f172a', family: 'Inter, sans-serif' },
                margin: { t: 30, r: 20, b: 40, l: 150 },
                showlegend: false,
                
                // Axis configurations for subplot domain partitioning
                // X1 is for Heatmap Matrix & Top Sample Labels (directly attached to top edge of heatmap)
                xaxis: {
                    domain: [xHeatmapStart, 1.0],
                    range: [xMin, xMax],
                    side: 'top',
                    tickangle: -45,
                    showgrid: false,
                    zeroline: false,
                    tickvals: xIndices,
                    ticktext: xLabels
                },
                // Y1 is for Heatmap Matrix & Gene Labels (range explicitly set to remove top axis padding)
                yaxis: {
                    domain: [0.0, yHeatmapEnd],
                    range: [numGenes - 0.5, -0.5],
                    showgrid: false,
                    zeroline: false,
                    tickvals: yIndices,
                    ticktext: yLabels
                },
                
                // X2 is for Gene Dendrogram (Left side)
                xaxis2: {
                    domain: [0.0, xGeneDendroEnd],
                    showgrid: false,
                    zeroline: false,
                    showticklabels: false,
                    autorange: 'reversed' // Branch outwards towards the left
                },
                
                // X3 & Y2 are for Sample Dendrogram (Top side, aligned 1:1 with xaxis)
                xaxis3: {
                    domain: [xHeatmapStart, 1.0],
                    range: [xMin, xMax],
                    showgrid: false,
                    zeroline: false,
                    showticklabels: false
                },
                yaxis2: {
                    domain: [ySampleDendroStart, 1.0],
                    range: [-0.02, 1.05],
                    showgrid: false,
                    zeroline: false,
                    showticklabels: false
                }
            };
            
            chartDiv.innerHTML = "";
            Plotly.newPlot('plotly-heatmap', traces, layout, {responsive: true});
        })
        .catch(err => {
            console.error("Clustering API 오류:", err);
            chartDiv.innerHTML = `<div class="text-center text-danger" style="padding-top: 150px;"><i class="fa-solid fa-triangle-exclamation fa-2x mb-10"></i><p>클러스터링 로드 실패: ${err.message}</p></div>`;
        });
    }
}

// Simple stats helpers in JS
function npMean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function npStd(arr) {
    const mean = npMean(arr);
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
}

// ----------------------------------------------------------------------
// 7. KEGG Pathway View
// ----------------------------------------------------------------------
function fetchKEGGPathways() {
    const listEl = document.getElementById("kegg-pathway-list");
    if (!listEl) return;
    const speciesLabel = (gCurrentSpecies === 'cgl') ? 'C. glutamicum' : 'Yeast';
    listEl.innerHTML = `<li class="loading-item">KEGG ${speciesLabel} 경로 목록을 가져오고 있습니다...</li>`;
    
    let url = `${API_URL}/api/pathways?species=${gCurrentSpecies}`;
    if (gActiveSessionId) {
        url += `&session_id=${gActiveSessionId}`;
    }
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            gPathwayList = data.pathways;
            
            // Clear input search term on fetch new dataset
            const searchInput = document.getElementById("kegg-search-gene");
            if (searchInput) searchInput.value = "";
            
            renderPathwayList("");
        })
        .catch(err => {
            listEl.innerHTML = `<li class="loading-item text-danger">실패: ${err.message}</li>`;
        });
}

function renderPathwayList(keyword) {
    const listEl = document.getElementById("kegg-pathway-list");
    listEl.innerHTML = "";
    
    if (!gPathwayList || gPathwayList.length === 0) {
        listEl.innerHTML = '<li class="loading-item text-muted">경로 데이터가 없습니다.</li>';
        return;
    }
    
    const searchVal = keyword.trim().toUpperCase();
    const filtered = gPathwayList.filter(path => {
        if (!searchVal) return true;
        // Search by Pathway ID or description
        if (path.pathway_id.toUpperCase().includes(searchVal) || path.description.toUpperCase().includes(searchVal)) {
            return true;
        }
        // Search by contained gene symbols or locus_tags
        if (path.search_genes && path.search_genes.some(g => g.includes(searchVal))) {
            return true;
        }
        return false;
    });
    
    if (filtered.length === 0) {
        listEl.innerHTML = '<li class="loading-item text-muted">검색 조건에 맞는 경로가 없습니다.</li>';
        return;
    }
    
    filtered.forEach(path => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="kegg-path-desc" title="${path.description}">
                <span class="kegg-path-id">${path.pathway_id}</span>
                ${path.description}
            </div>
            <span class="kegg-gene-count-badge">${path.gene_count} 유전자 매핑</span>
        `;
        
        li.addEventListener("click", () => {
            document.querySelectorAll("#kegg-pathway-list li").forEach(el => el.classList.remove("active"));
            li.classList.add("active");
            
            loadPathwayMap(path);
        });
        
        listEl.appendChild(li);
    });
}

function loadPathwayMap(path) {
    const container = document.getElementById("kegg-map-container");
    container.innerHTML = `
        <div class="no-pathway-selected">
            <i class="fa-solid fa-circle-notch fa-spin map-big-icon"></i>
            <p>KEGG 서버로부터 색상 맵핑 지도 생성 중...</p>
            <p class="sub-hint">대사 경로 상의 유전자 발현량에 따라 색칠된 원본 지도를 가져오고 있습니다.</p>
        </div>
    `;
    
    document.getElementById("kegg-map-title").textContent = `KEGG: ${path.description} (${path.pathway_id})`;
    
    let url = `${API_URL}/api/pathway_map/${path.pathway_id}?species=${gCurrentSpecies}`;
    if (gActiveSessionId) {
        url += `&session_id=${gActiveSessionId}`;
    }
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error("KEGG 연동에 실패했습니다. (네트워크 연결 혹은 KEGG API 한계 도달)");
            }
            return response.json();
        })
        .then(data => {
            renderPathwayImageViewer(data);
        })
        .catch(err => {
            container.innerHTML = `
                <div class="no-pathway-selected text-danger">
                    <i class="fa-solid fa-triangle-exclamation map-big-icon"></i>
                    <p>KEGG 지도 로드 실패</p>
                    <p class="sub-hint">${err.message}</p>
                </div>
            `;
        });
}

function getGeneColor(log2fc) {
    if (log2fc === null || log2fc === undefined) return null;
    
    if (log2fc > 0) {
        const ratio = Math.min(log2fc / 2.5, 1.0);
        // Semi-transparent Red (Up-regulated)
        return `rgba(239, 68, 68, ${0.4 + ratio * 0.45})`;
    } else {
        const ratio = Math.min(Math.abs(log2fc) / 2.5, 1.0);
        // Semi-transparent Blue (Down-regulated)
        return `rgba(59, 130, 246, ${0.4 + ratio * 0.45})`;
    }
}

function renderPathwayImageViewer(data) {
    const container = document.getElementById("kegg-map-container");
    container.innerHTML = "";
    
    // Create wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "kegg-image-wrapper";
    
    // Create image
    const img = document.createElement("img");
    img.src = data.image;
    img.useMap = "#keggmap_client";
    wrapper.appendChild(img);
    
    // Create Map
    const map = document.createElement("map");
    map.name = "keggmap_client";
    map.id = "keggmap_client";
    
    // Create custom tooltip element
    let tooltip = document.getElementById("kegg-active-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "kegg-active-tooltip";
        tooltip.className = "kegg-tooltip";
        document.body.appendChild(tooltip);
    }
    
    data.areas.forEach(area => {
        const areaEl = document.createElement("area");
        areaEl.shape = area.shape;
        areaEl.coords = area.coords;
        areaEl.alt = area.title;
        areaEl.href = "#"; // Prevent navigation
        
        // If it's a rect gene node and has log2fc, draw a styled colored overlay box
        if (area.shape === "rect" && area.log2fc !== null) {
            const coordsArr = area.coords.split(",").map(Number);
            if (coordsArr.length === 4) {
                const [x1, y1, x2, y2] = coordsArr;
                const overlay = document.createElement("div");
                overlay.className = "kegg-node-overlay";
                
                // Check if current search query matches this node
                const searchInput = document.getElementById("kegg-search-gene");
                const currentQuery = searchInput ? searchInput.value.trim().toUpperCase() : "";
                
                let isMatched = false;
                if (currentQuery) {
                    const genesList = area.gene.toUpperCase().split("+");
                    if (genesList.some(g => g === currentQuery)) {
                        isMatched = true;
                    }
                    if (area.title && area.title.toUpperCase().includes(currentQuery)) {
                        isMatched = true;
                    }
                    
                    // Support check by related genes from full dataset
                    const matchedGeneInData = gGenes.find(g => 
                        g.locus_tag.toUpperCase() === currentQuery || 
                        g.gene_symbol.toUpperCase() === currentQuery
                    );
                    if (matchedGeneInData) {
                        const targetLocus = matchedGeneInData.locus_tag.toUpperCase();
                        const targetSymbol = matchedGeneInData.gene_symbol.toUpperCase();
                        if (genesList.some(g => g === targetLocus || g === targetSymbol) ||
                            (area.title && (area.title.toUpperCase().includes(targetLocus) || area.title.toUpperCase().includes(targetSymbol)))) {
                            isMatched = true;
                        }
                    }
                }
                
                if (isMatched) {
                    overlay.classList.add("highlight-active");
                }
                
                overlay.style.position = "absolute";
                overlay.style.left = `${x1}px`;
                overlay.style.top = `${y1}px`;
                overlay.style.width = `${x2 - x1}px`;
                overlay.style.height = `${y2 - y1}px`;
                overlay.style.backgroundColor = getGeneColor(area.log2fc);
                overlay.style.border = "1.5px solid rgba(0, 0, 0, 0.4)";
                overlay.style.borderRadius = "2px";
                overlay.style.pointerEvents = "none"; // Let mouse events pass through to <area>
                overlay.style.boxSizing = "border-box";
                overlay.title = `${area.title} (Log2FC: ${area.log2fc})`;
                wrapper.appendChild(overlay);
            }
        }
        
        // Mouse hover interactions
        areaEl.addEventListener("mouseover", (e) => {
            tooltip.style.display = "flex";
            const fcText = area.log2fc !== null ? 
                `<span class="tooltip-fc ${area.log2fc >= 0 ? 'up-text' : 'down-text'}">Log2FC: ${area.log2fc > 0 ? '+' : ''}${area.log2fc}</span>` : 
                '<span class="text-muted">발현 데이터 미매칭</span>';
                
            tooltip.innerHTML = `
                <span class="tooltip-gene">${area.gene}</span>
                ${fcText}
                <span class="tooltip-desc">${area.title}</span>
            `;
            updateTooltipPosition(e, tooltip);
        });
        
        areaEl.addEventListener("mousemove", (e) => {
            updateTooltipPosition(e, tooltip);
        });
        
        areaEl.addEventListener("mouseout", () => {
            tooltip.style.display = "none";
        });
        
        areaEl.addEventListener("click", (e) => {
            e.preventDefault();
            
            // Support searching by locus_tag or gene_symbol in a multi-gene entry
            let match = null;
            // area.gene might be like "YAL038W+YOR347C"
            const genesList = area.gene.toUpperCase().split("+");
            for (const gCode of genesList) {
                match = gGenes.find(g => 
                    g.locus_tag.toUpperCase() === gCode || 
                    g.gene_symbol.toUpperCase() === gCode
                );
                if (match) break;
            }
            
            if (match) {
                showGeneDetails(match);
            }
        });
        
        map.appendChild(areaEl);
    });
    
    wrapper.appendChild(map);
    container.appendChild(wrapper);
}

function updateTooltipPosition(e, tooltip) {
    // Offset relative to mouse
    tooltip.style.left = `${e.pageX + 15}px`;
    tooltip.style.top = `${e.pageY + 15}px`;
}

// Modal Detail View (For KEGG area clicks)
function showGeneDetailsModal(gene) {
    openGeneIGVModal(gene);
}

// ----------------------------------------------------------------------
// 8. GO Enrichment & GO Term Gene Inspector
// ----------------------------------------------------------------------
function runGOEnrichment() {
    const direction = document.getElementById("go-direction").value;
    const log2fcThresh = parseFloat(document.getElementById("log2fc-thresh").value) || 0;
    const pvalThresh = parseFloat(document.getElementById("pvalue-thresh").value) || 1.0;
    
    // Select upregulated or downregulated locus tags based on threshold and stat-type
    const targetList = [];
    const statType = document.getElementById("stat-type") ? document.getElementById("stat-type").value : "fdr";
    gGenes.forEach(gene => {
        const statVal = statType === "fdr" ? gene.fdr : gene.pvalue;
        const passesLog2FC = Math.abs(gene.log2fc) >= log2fcThresh;
        let passesPVal = true;
        if (statType !== "none" && gIsReplicateMode) {
            passesPVal = (statVal !== null && statVal <= pvalThresh);
        }
        
        if (passesLog2FC && passesPVal) {
            if (direction === "up" && gene.log2fc >= log2fcThresh) {
                targetList.push(gene.locus_tag);
            } else if (direction === "down" && gene.log2fc <= -log2fcThresh) {
                targetList.push(gene.locus_tag);
            }
        }
    });
    
    const tbody = document.getElementById("go-table-body");
    tbody.innerHTML = `<tr><td colspan="8" class="text-center"><i class="fa-solid fa-spinner fa-spin icon-margin"></i>GO Enrichment 검정 수행 중... (수초가 소요될 수 있습니다)</td></tr>`;
    
    if (targetList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">선택한 임계값을 충족하는 ${direction === "up" ? '증가' : '감소'} 발현 유전자가 없습니다. 필터 조건을 완화해보세요.</td></tr>`;
        return;
    }
    
    const dbInfoEl = document.getElementById("go-db-info-text");
    if (dbInfoEl) {
        let dbName = "SGD Yeast GO Slim";
        if (gCurrentSpecies === "cgl") dbName = "Corynebacterium GO Slim";
        else if (gCurrentSpecies === "eco") dbName = "Escherichia coli K-12 GO Slim";
        dbInfoEl.innerHTML = `선택한 유전자군에 대해 <strong>${dbName}</strong> 데이터셋을 기반으로 Hypergeometric test(초기하 분포 통계 검정)를 수행하여 통계적으로 유의미한 기능 범주를 도출합니다.`;
    }
    
    fetch(`${API_URL}/api/go_enrichment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            genes: targetList,
            direction: direction,
            species: gCurrentSpecies,
            session_id: gActiveSessionId
        })
    })
    .then(r => {
        if (!r.ok) {
            return r.json().then(err => { throw new Error(err.detail || "GO 분석 실패") });
        }
        return r.json();
    })
    .then(data => {
        tbody.innerHTML = "";
        
        const enrichList = data.enrichment || [];
        if (enrichList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">유의미하게 농축된 GO 카테고리가 없습니다.</td></tr>`;
            document.getElementById("go-chart-container").style.display = "none";
            resetGOInspector();
            return;
        }
        
        // Group by ontology aspect and sort by pvalue ascending (lower is more significant)
        const aspectOrder = ["Molecular Function", "Cellular Component", "Biological Process"];
        const groupedList = [];
        
        aspectOrder.forEach(asp => {
            const subList = enrichList.filter(item => item.aspect === asp);
            subList.sort((a, b) => a.pvalue - b.pvalue);
            groupedList.push(...subList);
        });
        
        enrichList.forEach(item => {
            if (!aspectOrder.includes(item.aspect)) {
                groupedList.push(item);
            }
        });
        
        // Render sorted and grouped list to Table
        groupedList.slice(0, 100).forEach((item, index) => {
            const row = document.createElement("tr");
            row.className = "go-table-row";
            row.setAttribute("data-goid", item.goid);
            
            const genesListStr = item.genes.join(", ");
            const genesSnippet = genesListStr.length > 35 ? genesListStr.substring(0, 35) + "..." : genesListStr;
            
            row.innerHTML = `
                <td><code style="font-weight: 600; color: #6366f1;">${item.goid}</code></td>
                <td><span class="badge ${item.aspect === 'Molecular Function' ? 'badge-optional' : (item.aspect === 'Cellular Component' ? 'badge-required' : 'badge-info')}">${item.aspect}</span></td>
                <td><strong>${escapeHtml(item.term_name)}</strong></td>
                <td class="text-center"><strong>${item.k}</strong></td>
                <td class="text-center">${item.M}</td>
                <td>${item.pvalue.toExponential(4)}</td>
                <td>${item.fdr.toExponential(4)}</td>
                <td class="text-muted" title="${genesListStr}">${genesSnippet} <i class="fa-solid fa-chevron-right" style="font-size: 11px; margin-left: 4px; color: #6366f1;"></i></td>
            `;
            
            row.addEventListener("click", () => {
                document.querySelectorAll(".go-table-row").forEach(r => r.classList.remove("selected-go-row"));
                row.classList.add("selected-go-row");
                selectGOTermInspector(item);
            });
            
            tbody.appendChild(row);
        });

        // Automatically select first GO Term on load
        if (groupedList.length > 0) {
            const firstRow = tbody.querySelector(".go-table-row");
            if (firstRow) {
                firstRow.classList.add("selected-go-row");
            }
            selectGOTermInspector(groupedList[0]);
        }

        // Group terms for Plotly horizontal bar chart
        const molTerms = groupedList.filter(item => item.aspect === "Molecular Function").slice(0, 8);
        const cellTerms = groupedList.filter(item => item.aspect === "Cellular Component").slice(0, 8);
        const bioTerms = groupedList.filter(item => item.aspect === "Biological Process").slice(0, 8);
        
        const chartTerms = [...molTerms.reverse(), ...cellTerms.reverse(), ...bioTerms.reverse()];
        
        if (chartTerms.length > 0) {
            document.getElementById("go-chart-container").style.display = "block";
            const allLabels = chartTerms.map(t => `${t.term_name} (${t.goid})`);
            
            const molTrace = {
                x: chartTerms.map(t => t.aspect === "Molecular Function" ? -Math.log10(t.fdr || t.pvalue || 1e-10) : null),
                y: allLabels,
                name: 'Molecular Function',
                type: 'bar',
                orientation: 'h',
                marker: { color: '#3b82f6' }
            };
            
            const cellTrace = {
                x: chartTerms.map(t => t.aspect === "Cellular Component" ? -Math.log10(t.fdr || t.pvalue || 1e-10) : null),
                y: allLabels,
                name: 'Cellular Component',
                type: 'bar',
                orientation: 'h',
                marker: { color: '#10b981' }
            };
            
            const bioTrace = {
                x: chartTerms.map(t => t.aspect === "Biological Process" ? -Math.log10(t.fdr || t.pvalue || 1e-10) : null),
                y: allLabels,
                name: 'Biological Process',
                type: 'bar',
                orientation: 'h',
                marker: { color: '#f87171' }
            };
            
            const layout = {
                title: {
                    text: 'Gene Ontology Enrichment Results (-log10 q-value)',
                    font: { size: 16, color: '#0f172a', family: 'Inter, sans-serif' }
                },
                barmode: 'overlay',
                xaxis: {
                    title: '-log10(qvalue 또는 pvalue)',
                    gridcolor: '#e2e8f0',
                    zerolinecolor: '#cbd5e1',
                    tickfont: { color: '#475569' }
                },
                yaxis: {
                    type: 'category',
                    categoryorder: 'array',
                    categoryarray: allLabels,
                    tickfont: { size: 10, color: '#0f172a' },
                    automargin: true
                },
                margin: { l: 280, r: 20, t: 50, b: 50 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                legend: {
                    title: { text: 'GO Aspect' },
                    font: { color: '#0f172a' },
                    orientation: 'h',
                    y: -0.2
                }
            };
            
            Plotly.newPlot('go-bar-chart', [molTrace, cellTrace, bioTrace], layout, {responsive: true});
        } else {
            document.getElementById("go-chart-container").style.display = "none";
        }
    })
    .catch(err => {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">에러 발생: ${err.message}</td></tr>`;
    });
}

function selectGOTermInspector(item) {
    gCurrentSelectedGOTerm = item;
    
    const titleEl = document.getElementById("selected-go-title");
    const subTitleEl = document.getElementById("selected-go-subtitle");
    
    if (titleEl) {
        titleEl.textContent = `GO Term 매칭 유전자 상세 분석: ${item.term_name} (${item.goid})`;
    }
    if (subTitleEl) {
        subTitleEl.textContent = `분류: ${item.aspect} | 총 ${item.k}개 매칭 유전자 (p-value: ${item.pvalue.toExponential(4)}, FDR: ${item.fdr.toExponential(4)})`;
    }
    
    // Match genes from gGenes
    const locusSet = new Set((item.genes || []).map(g => g.toUpperCase()));
    gCurrentSelectedGOGenes = gGenes.filter(g => 
        locusSet.has(g.locus_tag.toUpperCase()) || 
        locusSet.has(g.gene_symbol.toUpperCase())
    );
    
    renderGOInspectorTable();
}

function resetGOInspector() {
    gCurrentSelectedGOTerm = null;
    gCurrentSelectedGOGenes = [];
    
    const titleEl = document.getElementById("selected-go-title");
    const subTitleEl = document.getElementById("selected-go-subtitle");
    const tbody = document.getElementById("go-inspector-table-body");
    
    if (titleEl) titleEl.textContent = "GO Term 매칭 유전자 상세 분석 (GO Term Gene Inspector)";
    if (subTitleEl) subTitleEl.textContent = "상단 GO Enrichment 결과 테이블에서 원하는 GO ID 행을 클릭하면 해당 범주의 전체 매칭 유전자 리스트가 하단에 바인딩됩니다.";
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted" style="padding: 36px 16px;">
                    <i class="fa-solid fa-hand-pointer" style="font-size: 28px; margin-bottom: 10px; color: #94a3b8; display: block;"></i>
                    상단 GO 분석 테이블에서 특정 GO ID 행을 클릭하시면 전체 유전자 목록이 표출됩니다.
                </td>
            </tr>
        `;
    }
}

function renderGOInspectorTable() {
    const tbody = document.getElementById("go-inspector-table-body");
    const searchInput = document.getElementById("search-go-inspector-gene");
    if (!tbody) return;
    
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    
    let filtered = gCurrentSelectedGOGenes;
    if (query !== "") {
        filtered = gCurrentSelectedGOGenes.filter(g => 
            g.locus_tag.toLowerCase().includes(query) || 
            g.gene_symbol.toLowerCase().includes(query) ||
            (g.description && g.description.toLowerCase().includes(query))
        );
    }
    
    tbody.innerHTML = "";
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 24px;">매칭되는 유전자가 없습니다.</td></tr>`;
        return;
    }
    
    filtered.forEach(gene => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        
        const isUp = gene.log2fc >= 0;
        const fcClass = isUp ? "up-text" : "down-text";
        const stateBadge = isUp ? '<span class="badge badge-required" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">UP ▲</span>' : '<span class="badge badge-optional" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2);">DOWN ▼</span>';
        
        const fdrVal = gene.fdr !== null && gene.fdr !== undefined ? gene.fdr : gene.pvalue;
        const fdrDisplay = fdrVal !== null && fdrVal !== undefined ? fdrVal.toExponential(3) : '-';
        
        tr.innerHTML = `
            <td><code style="color: #6366f1; font-weight: 700;">${gene.locus_tag}</code></td>
            <td><strong>${escapeHtml(gene.gene_symbol)}</strong></td>
            <td class="stat-header">${gene.wt_val !== undefined && gene.wt_val !== null ? gene.wt_val.toFixed(2) : '-'}</td>
            <td class="stat-header">${gene.mutant_val !== undefined && gene.mutant_val !== null ? gene.mutant_val.toFixed(2) : '-'}</td>
            <td class="stat-header ${fcClass}"><strong>${gene.log2fc >= 0 ? '+' : ''}${gene.log2fc.toFixed(2)}</strong></td>
            <td class="stat-header">${fdrDisplay}</td>
            <td class="text-center">${stateBadge}</td>
            <td style="font-size: 12.5px; color: var(--text-secondary); max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(gene.description || '')}">${escapeHtml(gene.description || '-')}</td>
        `;
        
        tr.addEventListener("click", () => {
            showGeneDetailsModal(gene);
        });
        
        tbody.appendChild(tr);
    });
}

function exportSelectedGOGenesToExcel() {
    if (!gCurrentSelectedGOTerm || !gCurrentSelectedGOGenes || gCurrentSelectedGOGenes.length === 0) {
        alert("내보낼 GO Term 유전자 데이터가 없습니다. GO Term 행을 먼저 선택해 주세요.");
        return;
    }
    
    const goIdClean = gCurrentSelectedGOTerm.goid.replace(":", "_");
    const filename = `GO_Genes_${goIdClean}.csv`;
    
    let csvContent = "\uFEFFLocus_Tag,Gene_Symbol,WT_Value,Mutant_Value,Log2FC,FDR,State,Description\n";
    
    gCurrentSelectedGOGenes.forEach(g => {
        const state = g.log2fc >= 0 ? "UP" : "DOWN";
        const desc = (g.description || "").replace(/"/g, '""');
        const fdrVal = g.fdr !== null && g.fdr !== undefined ? g.fdr : g.pvalue;
        csvContent += `"${g.locus_tag}","${g.gene_symbol}",${g.wt_val || 0},${g.mutant_val || 0},${g.log2fc},${fdrVal || ''},"${state}","${desc}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// ----------------------------------------------------------------------
// 11. STRING PPI & TF-Target Regulatory Network Graph
// ----------------------------------------------------------------------
let cyInstance = null;
let gNetworkMode = 'string'; // 'string', 'tf', or 'modulator'
let gTFAssociationData = null; // Stored results from TF enrichment
let gNetworkCurrentData = { nodes: [], edges: [] };

function exportNetworkToExcel() {
    if (!gNetworkCurrentData || (!gNetworkCurrentData.nodes.length && !gNetworkCurrentData.edges.length)) {
        alert("내보낼 네트워크 데이터가 없습니다. 먼저 네트워크를 렌더링해주세요.");
        return;
    }
    
    fetch(`${API_URL}/api/network/export_excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gNetworkCurrentData)
    })
    .then(res => {
        if (!res.ok) throw new Error("엑셀 내보내기 실패");
        return res.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "yeast_ppi_network_data.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    })
    .catch(err => alert("네트워크 엑셀 다운로드 중 오류 발생: " + err.message));
}

let gNetTargetGene = null;

function focusTargetNetwork(geneSymbol) {
    if (!geneSymbol) return;
    gNetTargetGene = geneSymbol;
    const input = document.getElementById("network-target-input");
    if (input) input.value = geneSymbol;
    renderNetworkGraph();
}

function resetNetworkTargetView() {
    gNetTargetGene = null;
    const input = document.getElementById("network-target-input");
    if (input) input.value = "";
    renderNetworkGraph();
}

function renderTopHubsChips() {
    const hubBox = document.getElementById("network-top-hubs-container");
    if (!hubBox || !gNetworkCurrentData || !gNetworkCurrentData.nodes) return;
    
    // Sort nodes by degree descending
    const sorted = [...gNetworkCurrentData.nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
    const topHubs = sorted.slice(0, 6);
    if (topHubs.length === 0) return;
    
    let html = `
        <div style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
            <span><i class="fa-solid fa-crown" style="color: #f59e0b;"></i> 핵심 허브 유전자 (Top Degree)</span>
            <span style="font-size: 10px; color: #94a3b8;">클릭 시 포커스</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
    `;
    
    topHubs.forEach(h => {
        const deg = h.degree || 0;
        const color = h.log2fc >= 0 ? '#ef4444' : '#3b82f6';
        html += `
            <button type="button" class="btn btn-outline-secondary btn-sm net-hub-chip" data-id="${h.id}" data-label="${h.label}" style="font-size: 11px; padding: 2px 7px; border-radius: 12px; background: #fff; border-color: #cbd5e1; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${color};"></span>
                <strong>${h.label}</strong>
                <span style="font-size: 10px; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 6px;">k=${deg}</span>
            </button>
        `;
    });
    html += `</div>`;
    hubBox.innerHTML = html;
    
    hubBox.querySelectorAll(".net-hub-chip").forEach(btn => {
        btn.onclick = () => {
            const geneId = btn.getAttribute("data-id");
            if (cyInstance) {
                const targetNode = cyInstance.getElementById(geneId);
                if (targetNode && targetNode.length > 0) {
                    cyInstance.nodes().unselect();
                    targetNode.select();
                    cyInstance.animate({
                        center: { eles: targetNode },
                        zoom: 1.5,
                        duration: 400
                    });
                    showNetworkNodeDetails(targetNode.data());
                }
            }
        };
    });
}

function showNetworkNodeDetails(nodeData) {
    const detailsPanel = document.getElementById("network-node-details");
    if (!detailsPanel) return;
    const nodeGene = { locus_tag: nodeData.id, gene_symbol: nodeData.label };
    const uUrl = getUniprotUrl(nodeGene);
    const deg = nodeData.degree || 0;
    const isSeed = nodeData.is_seed || false;
    
    detailsPanel.innerHTML = `
        <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <span style="font-size: 11px; font-weight: 600; color: #6366f1; text-transform: uppercase;">ORF Name (Systematic ID)</span>
                <h5 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 2px 0;">${nodeData.id}</h5>
            </div>
            <a href="${uUrl}" target="_blank" rel="noopener noreferrer" class="uniprot-badge-btn" title="UniProt에서 상세 단백질 정보 보기">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> UniProt DB
            </a>
        </div>
        <div style="margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 600; color: #64748b;">Gene Symbol</span>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                <span style="font-size: 15px; font-weight: 700; color: #1e293b;">${nodeData.label}</span>
                ${isSeed ? '<span style="background: #f59e0b; color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-bullseye"></i> Seed Target</span>' : ''}
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
            <div style="background: #f8fafc; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <span style="font-size: 10px; font-weight: 600; color: #64748b; display: block;">Log2 Fold Change</span>
                <span style="font-size: 13px; font-weight: 700; color: ${nodeData.log2fc >= 0 ? '#ef4444' : '#3b82f6'};">
                    ${nodeData.log2fc >= 0 ? '+' : ''}${typeof nodeData.log2fc === 'number' ? nodeData.log2fc.toFixed(3) : nodeData.log2fc}
                </span>
            </div>
            <div style="background: #f8fafc; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <span style="font-size: 10px; font-weight: 600; color: #64748b; display: block;">연결 차수 (Degree)</span>
                <span style="font-size: 13px; font-weight: 700; color: #0284c7;">
                    <i class="fa-solid fa-circle-nodes"></i> ${deg}개 파트너
                </span>
            </div>
        </div>
        <div style="margin-bottom: 12px;">
            <span style="font-size: 11px; font-weight: 600; color: #64748b;">Gene Description</span>
            <p style="font-size: 12px; line-height: 1.5; color: #475569; margin: 2px 0; max-height: 130px; overflow-y: auto; background: #fafafa; padding: 6px 8px; border-radius: 4px; border: 1px solid #f1f5f9;">
                ${nodeData.desc || '설명 정보 없음'}
            </p>
        </div>
        <div style="border-top: 1px solid #f1f5f9; padding-top: 10px; display: flex; flex-direction: column; gap: 6px;">
            <button type="button" id="btn-focus-ego-net" class="btn btn-primary btn-sm" style="width: 100%; font-size: 11px; justify-content: center; background: #6366f1; border-color: #6366f1;">
                <i class="fa-solid fa-crosshairs"></i> 이 유전자 중심 서브망 재구성
            </button>
            <button type="button" id="btn-net-reg-target" class="btn btn-secondary btn-sm" style="width: 100%; font-size: 11px; justify-content: center;">
                <i class="fa-solid fa-star" style="color: #f59e0b;"></i> 맞춤 대사경로 타깃 후보로 등록
            </button>
        </div>
        <div id="network-top-hubs-container" style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1;"></div>
    `;

    const btnFocus = document.getElementById("btn-focus-ego-net");
    if (btnFocus) {
        btnFocus.onclick = () => {
            focusTargetNetwork(nodeData.label || nodeData.id);
        };
    }
    const btnReg = document.getElementById("btn-net-reg-target");
    if (btnReg) {
        btnReg.onclick = () => {
            const sym = nodeData.label || nodeData.id;
            const strat = (nodeData.log2fc >= 0) ? "OE" : "KO";
            registerCandidateAsTarget(sym, strat, `PPI 네트워크 발굴 (연결 차수: ${deg})`);
        };
    }
    renderTopHubsChips();
}

function renderNetworkGraph() {
    const limit = document.getElementById("network-limit") ? document.getElementById("network-limit").value : 50;
    const score = document.getElementById("network-score") ? document.getElementById("network-score").value : 400;
    const source = document.getElementById("network-source") ? document.getElementById("network-source").value : 'hybrid';
    const type = document.getElementById("network-type") ? document.getElementById("network-type").value : 'all';
    const container = document.getElementById("cy-network");
    
    const targetInput = document.getElementById("network-target-input");
    const depthSelect = document.getElementById("network-depth-select");
    const btnReset = document.getElementById("btn-reset-network-view");
    const btnClearTarget = document.getElementById("btn-net-clear-target");
    
    const targetGene = gNetTargetGene !== null ? gNetTargetGene : (targetInput ? targetInput.value.trim() : "");
    const depth = depthSelect ? depthSelect.value : 1;
    
    if (targetInput && gNetTargetGene !== null) {
        targetInput.value = gNetTargetGene;
    }
    
    if (btnReset) btnReset.style.display = targetGene ? "inline-flex" : "none";
    if (btnClearTarget) btnClearTarget.style.display = targetGene ? "block" : "none";

    const titleEl = document.getElementById("network-tab-title");
    
    if (gNetworkMode === 'string') {
        if (titleEl) {
            let srcLabel = "하이브리드 (BioGRID + STRING)";
            if (source === "biogrid") srcLabel = "BioGRID (실험 검증 PPI)";
            else if (source === "string") srcLabel = "STRING-DB API";
            
            if (targetGene) {
                titleEl.innerHTML = `🎯 타깃 중심 서브네트워크: <span style="font-weight: 700; color: #6366f1;">${targetGene}</span> <span style="font-size: 12px; color: #64748b;">(${depth}-Hop 이웃, ${srcLabel})</span>`;
            } else {
                titleEl.innerHTML = `단백질 상호작용 네트워크 <span style="font-size: 13px; font-weight: 500; color: #6366f1;">[${srcLabel}]</span>`;
            }
        }
        
        container.innerHTML = `<div style="text-align: center; padding-top: 200px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top: 10px;">${targetGene ? `타깃 '${targetGene}' 중심 서브네트워크 추출 중...` : 'PPI 상호작용 네트워크 불러오는 중...'}</p></div>`;
        
        const params = new URLSearchParams({
            limit: limit,
            score: score,
            source: source,
            interaction_type: type,
            species: gCurrentSpecies || 'sce',
            session_id: gActiveSessionId || ''
        });
        
        if (targetGene) {
            params.append("target_gene", targetGene);
            params.append("depth", depth);
        }

        fetch(`${API_URL}/api/network?${params.toString()}`)
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                container.innerHTML = `<div class="text-center text-danger" style="padding-top: 200px;"><i class="fa-solid fa-triangle-exclamation fa-2x mb-10"></i><p>${data.detail || '네트워크 로딩 실패'}</p></div>`;
                return;
            }
            
            const nodes = data.nodes || [];
            const edges = data.edges || [];
            gNetworkCurrentData = { nodes: nodes, edges: edges };
            
            if (nodes.length === 0) {
                container.innerHTML = `<div class="text-center text-muted" style="padding-top: 200px;">
                    <i class="fa-solid fa-circle-nodes fa-2x" style="color: #cbd5e1; margin-bottom: 10px;"></i>
                    <p>${targetGene ? `'${targetGene}'와 연결된 상호작용 파트너를 찾을 수 없습니다.` : '상위 DEG 유전자들에 매칭되는 상호작용 노드가 없습니다.'}</p>
                    ${targetGene ? `<button class="btn btn-secondary btn-sm" onclick="resetNetworkTargetView()" style="margin-top: 8px;">전체망으로 복귀</button>` : ''}
                </div>`;
                return;
            }
            
            container.innerHTML = "";
            const elements = [];
            
            nodes.forEach(n => {
                let color = '#cbd5e1';
                let borderCol = '#94a3b8';
                let borderWidth = '2px';
                let nodeSize = 46;
                
                if (n.log2fc > 0) {
                    const intensity = Math.min(n.log2fc / 2.0, 1.0);
                    color = `rgb(${255}, ${Math.round(255 - 200 * intensity)}, ${Math.round(255 - 200 * intensity)})`;
                } else if (n.log2fc < 0) {
                    const intensity = Math.min(Math.abs(n.log2fc) / 2.0, 1.0);
                    color = `rgb(${Math.round(255 - 200 * intensity)}, ${Math.round(255 - 200 * intensity)}, ${255})`;
                }
                
                // Highlight target seed node with prominent gold emblem styling
                if (n.is_seed) {
                    borderCol = '#f59e0b';
                    borderWidth = '4.5px';
                    nodeSize = 58;
                }
                
                elements.push({
                    data: {
                        id: n.id,
                        label: n.label,
                        log2fc: n.log2fc,
                        desc: n.desc,
                        degree: n.degree || 0,
                        is_seed: n.is_seed || false,
                        bg: color,
                        borderCol: borderCol,
                        borderWidth: borderWidth,
                        nodeSize: `${nodeSize}px`
                    }
                });
            });
            
            edges.forEach((e, idx) => {
                let lineStyle = 'solid';
                let edgeColor = '#059669';
                if (e.type === 'genetic') {
                    lineStyle = 'dashed';
                    edgeColor = '#a855f7';
                } else if (e.type === 'functional') {
                    lineStyle = 'dotted';
                    edgeColor = '#3b82f6';
                }
                
                elements.push({
                    data: {
                        id: `e_${idx}`,
                        source: e.source,
                        target: e.target,
                        weight: e.score / 1000.0,
                        type: e.type || 'physical',
                        db: e.db || 'BioGRID',
                        lineStyle: lineStyle,
                        edgeColor: edgeColor
                    }
                });
            });
            
            cyInstance = cytoscape({
                container: container,
                elements: elements,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'background-color': 'data(bg)',
                            'border-width': 'data(borderWidth)',
                            'border-color': 'data(borderCol)',
                            'color': '#0f172a',
                            'font-size': '12px',
                            'font-weight': 'bold',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'width': 'data(nodeSize)',
                            'height': 'data(nodeSize)',
                            'overlay-padding': '4px',
                            'text-outline-width': '2px',
                            'text-outline-color': '#ffffff'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': 'mapData(weight, 0.4, 1.0, 2.0, 5.0)',
                            'line-color': 'data(edgeColor)',
                            'line-style': 'data(lineStyle)',
                            'curve-style': 'bezier',
                            'opacity': 0.8
                        }
                    }
                ],
                layout: {
                    name: 'cose',
                    animate: true,
                    nodeRepulsion: function( node ){ return 2048; },
                    idealEdgeLength: function( edge ){ return 64; },
                    fit: true
                }
            });
            
            const detailsPanel = document.getElementById("network-node-details");
            if (detailsPanel) {
                detailsPanel.innerHTML = `
                    <div style="text-align: center; padding: 20px 8px; color: #64748b;">
                        <i class="fa-solid fa-circle-nodes fa-2x" style="color: #6366f1; opacity: 0.6; margin-bottom: 8px;"></i>
                        <p style="font-size: 12px; margin: 0 0 10px 0;">유전자 노드를 클릭하면 상호작용 상세 정보 및 타깃 서브망 재구성이 가능합니다.</p>
                    </div>
                    <div id="network-top-hubs-container" style="border-top: 1px dashed #cbd5e1; padding-top: 10px;"></div>
                `;
                renderTopHubsChips();
            }
            
            cyInstance.on('tap', 'node', function(evt){
                showNetworkNodeDetails(evt.target.data());
            });
        })
        .catch(err => {
            container.innerHTML = `<div class="text-center text-danger" style="padding-top: 200px;"><i class="fa-solid fa-circle-exclamation fa-2x mb-10"></i><p>네트워크 렌더링 실패: ${err.message}</p></div>`;
        });
    } else {
        // TF-Target Regulatory Network Mode
        container.innerHTML = `<div style="text-align: center; padding-top: 200px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top: 10px;">전사인자(TF) 조절 관계 연산 및 초기하 검정 중...</p></div>`;
        const tfListContainer = document.getElementById("network-tf-list-container");
        if (tfListContainer) {
            tfListContainer.innerHTML = `<div style="text-align: center; padding-top: 80px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i><p style="font-size: 12px; margin-top: 6px;">TF 목록 집계 중...</p></div>`;
        }

        // Calculate targetList based on current threshold
        const log2fcThresh = parseFloat(document.getElementById("log2fc-thresh").value) || 0;
        const pvalThresh = parseFloat(document.getElementById("pvalue-thresh").value) || 1.0;
        const statType = document.getElementById("stat-type") ? document.getElementById("stat-type").value : "fdr";
        const targetList = [];
        gGenes.forEach(gene => {
            const statVal = statType === "fdr" ? gene.fdr : gene.pvalue;
            const passesLog2FC = Math.abs(gene.log2fc) >= log2fcThresh;
            let passesPVal = true;
            if (statType !== "none" && gIsReplicateMode) {
                passesPVal = (statVal !== null && statVal <= pvalThresh);
            }
            if (passesLog2FC && passesPVal) {
                targetList.push(gene.locus_tag);
            }
        });

        // Use gSelectedTfId if set
        const selectedTfParam = gSelectedTfId || null;

        fetch(`${API_URL}/api/tf_enrichment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                genes: targetList,
                selected_tf: selectedTfParam,
                species: gCurrentSpecies,
                session_id: gActiveSessionId
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success === false) {
                container.innerHTML = `<div class="text-center text-danger" style="padding-top: 200px;"><i class="fa-solid fa-circle-exclamation fa-2x mb-10"></i><p>TF 분석 실패: ${data.detail || "알 수 없는 에러"}</p></div>`;
                return;
            }
            
            gTFAssociationData = data.enrichment || [];
            
            // If gSelectedTfId wasn't set, default to top 1 TF returned from backend
            let activeTfId = selectedTfParam;
            if (!activeTfId && gTFAssociationData.length > 0) {
                activeTfId = gTFAssociationData[0].tf_id;
                gSelectedTfId = activeTfId;
            }
            
            // 1. Render TF Enrichment Table in the Right Subtab
            renderTFListTable(gTFAssociationData, activeTfId);
            
            // 2. Render Full Regulatory Network
            const network = data.network || { nodes: [], edges: [] };
            const nodes = network.nodes || [];
            const edges = network.edges || [];
            
            if (nodes.length === 0) {
                container.innerHTML = `<div class="text-center text-muted" style="padding-top: 200px;">규제 네트워크를 렌더링할 유의미한 TF-Target 관계가 없습니다.</div>`;
                return;
            }
            
            container.innerHTML = "";
            const elements = [];
            
            nodes.forEach(n => {
                let color = '#cbd5e1';
                let shape = 'ellipse';
                let borderCol = '#1e293b';
                
                if (n.is_tf) {
                    shape = 'hexagon';
                    color = '#818cf8'; // Premium indigo for TFs
                    borderCol = '#4f46e5';
                } else {
                    if (n.log2fc > 0) {
                        const intensity = Math.min(n.log2fc / 2.0, 1.0);
                        color = `rgb(${255}, ${Math.round(255 - 200 * intensity)}, ${Math.round(255 - 200 * intensity)})`;
                    } else if (n.log2fc < 0) {
                        const intensity = Math.min(Math.abs(n.log2fc) / 2.0, 1.0);
                        color = `rgb(${Math.round(255 - 200 * intensity)}, ${Math.round(255 - 200 * intensity)}, ${255})`;
                    }
                }
                
                elements.push({
                    data: {
                        id: n.id,
                        label: n.label,
                        log2fc: n.log2fc || 0,
                        is_tf: n.is_tf,
                        desc: n.desc || '',
                        bg: color,
                        shape: shape,
                        border: borderCol
                    }
                });
            });
            
            edges.forEach((e, idx) => {
                elements.push({
                    data: {
                        id: `tf_e_${idx}`,
                        source: e.source,
                        target: e.target,
                        type: e.type || 'regulate'
                    }
                });
            });
            
            cyInstance = cytoscape({
                container: container,
                elements: elements,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'background-color': 'data(bg)',
                            'shape': 'data(shape)',
                            'border-width': '2.5px',
                            'border-color': 'data(border)',
                            'color': '#0f172a',
                            'font-size': '11px',
                            'font-weight': 'bold',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'width': '48px',
                            'height': '48px',
                            'text-outline-width': '1.5px',
                            'text-outline-color': '#ffffff'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': '2px',
                            'line-color': '#a5b4fc',
                            'target-arrow-color': '#4f46e5',
                            'target-arrow-shape': 'triangle', // Clarifies regulatory flow directions (TF -> Target)
                            'curve-style': 'bezier',
                            'opacity': 0.85
                        }
                    }
                ],
                layout: {
                    name: 'cose',
                    animate: true,
                    nodeRepulsion: function( node ){ return 3000; },
                    idealEdgeLength: function( edge ){ return 80; },
                    fit: true
                }
            });
            
            // Node Tap Listener
            const detailsPanel = document.getElementById("network-node-details");
            cyInstance.on('tap', 'node', function(evt){
                const nodeData = evt.target.data();
                
                // Switch to detail subtab
                document.getElementById("btn-subtab-node").click();
                
                detailsPanel.innerHTML = `
                    <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 12px;">
                        <span style="font-size: 11px; font-weight: 600; color: #6366f1; text-transform: uppercase;">
                            ${nodeData.is_tf ? 'Transcription Factor (TF)' : 'Target DEG Gene'}
                        </span>
                        <h5 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 2px 0;">${nodeData.id}</h5>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <span style="font-size: 11px; font-weight: 600; color: #64748b;">Gene Symbol</span>
                        <p style="font-size: 14px; font-weight: 500; color: #1e293b; margin: 2px 0;">${nodeData.label}</p>
                    </div>
                    ${!nodeData.is_tf ? `
                    <div style="margin-bottom: 10px;">
                        <span style="font-size: 11px; font-weight: 600; color: #64748b;">Log2 Fold Change</span>
                        <p style="font-size: 14px; font-weight: 600; color: ${nodeData.log2fc >= 0 ? '#ef4444' : '#3b82f6'}; margin: 2px 0;">
                            ${nodeData.log2fc >= 0 ? '+' : ''}${nodeData.log2fc.toFixed(4)}
                        </p>
                    </div>` : ''}
                    <div>
                        <span style="font-size: 11px; font-weight: 600; color: #64748b;">Description</span>
                        <p style="font-size: 13px; line-height: 1.5; color: #475569; margin: 2px 0; max-height: 200px; overflow-y: auto;">
                            ${nodeData.desc || '설명 정보 없음'}
                        </p>
                    </div>
                `;
            });
        })
        .catch(err => {
            console.error("TF Network 렌더링 실패:", err);
            container.innerHTML = `<div class="text-center text-danger" style="padding-top: 200px;"><i class="fa-solid fa-circle-exclamation fa-2x mb-10"></i><p>네트워크 렌더링 실패: ${err.message}</p></div>`;
        });
    }
}

function renderTFListTable(tfResults, activeTfId) {
    const container = document.getElementById("network-tf-list-container");
    if (!container) return;
    
    if (tfResults.length === 0) {
        container.innerHTML = `<p class="text-center text-muted" style="padding: 20px 0;">농축된 전사인자(TF)가 존재하지 않습니다.</p>`;
        return;
    }
    
    let html = `
        <div class="table-responsive" style="max-height: 520px; overflow-y: auto;">
            <table class="data-table" style="font-size: 11px; width: 100%;">
                <thead>
                    <tr>
                        <th>TF</th>
                        <th class="stat-header">매치 (k/M)</th>
                        <th class="stat-header">p-value</th>
                        <th class="stat-header">FDR</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    tfResults.forEach(r => {
        const isSelected = r.tf_id === activeTfId;
        const rowStyle = isSelected ? "background: rgba(99, 102, 241, 0.15); font-weight: bold;" : "";
        const rowClass = isSelected ? "tf-row selected-tf-row" : "tf-row";
        
        html += `
            <tr class="${rowClass}" data-tf-id="${r.tf_id}" data-tf-name="${r.tf_name}" style="cursor: pointer; ${rowStyle}">
                <td><strong>${r.tf_name}</strong></td>
                <td class="text-center">${r.k} / ${r.M}</td>
                <td class="text-right">${r.pvalue.toExponential(3)}</td>
                <td class="text-right">${r.fdr.toExponential(3)}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Add Row Click Event to fetch network for specific TF
    container.querySelectorAll(".tf-row").forEach(row => {
        row.addEventListener("click", () => {
            const tfId = row.getAttribute("data-tf-id");
            gSelectedTfId = tfId;
            
            // Update selected indicator classes
            container.querySelectorAll(".tf-row").forEach(r => {
                r.classList.remove("selected-tf-row");
                r.style.background = "";
                r.style.fontWeight = "normal";
            });
            row.classList.add("selected-tf-row");
            row.style.background = "rgba(99, 102, 241, 0.15)";
            row.style.fontWeight = "bold";
            
            // Re-render Cytoscape network focused on this TF
            renderNetworkGraph();
        });
    });
}

function highlightTFInNetwork(tfName) {
    if (!cyInstance) return;
    
    cyInstance.batch(() => {
        // 1. Reset styles
        cyInstance.nodes().style({
            'opacity': 0.25,
            'border-color': '#cbd5e1'
        });
        cyInstance.edges().style({
            'opacity': 0.1,
            'line-color': '#e2e8f0'
        });
        
        // 2. Find TF node
        const tfNode = cyInstance.getElementById(tfName);
        if (tfNode.length > 0) {
            tfNode.style({
                'opacity': 1.0,
                'border-color': '#4f46e5',
                'border-width': '4px',
                'width': '65px',
                'height': '65px'
            });
            
            // 3. Find connected targets and edges
            const connectedEdges = tfNode.connectedEdges();
            connectedEdges.style({
                'opacity': 1.0,
                'line-color': '#4f46e5',
                'width': '3.5px'
            });
            
            connectedEdges.targets().style({
                'opacity': 1.0,
                'border-color': '#1e293b',
                'border-width': '2.5px'
            });
            
            // Pan and zoom to TF node and targets
            cyInstance.animate({
                fit: {
                    eles: tfNode.union(connectedEdges.targets()),
                    padding: 50
                },
                duration: 500
            });
        } else {
            // TF is not in network viewport, reset to show all
            cyInstance.nodes().style('opacity', 1.0);
            cyInstance.edges().style('opacity', 0.85);
            cyInstance.fit();
            alert(`전사인자 "${tfName}"가 현재 가시 노드 내에 포함되어 있지 않습니다.`);
        }
    });
}

// ----------------------------------------------------------------------
// 10. Data & Visual Chart Export Helpers (Excel, JPG, PDF)
// ----------------------------------------------------------------------
function exportPlotlyChart(elementId, format, filename) {
    const gd = document.getElementById(elementId);
    if (!gd || !gd.data || gd.data.length === 0) {
        alert("내보낼 차트 데이터가 존재하지 않습니다.");
        return;
    }
    
    // Deep copy original layout properties to restore them later
    const originalLayout = JSON.parse(JSON.stringify(gd.layout));
    
    // Create a temporary light-theme-friendly layout for high-quality publication export
    const exportLayout = {
        ...gd.layout,
        paper_bgcolor: '#ffffff',
        plot_bgcolor: '#ffffff'
    };
    
    // Force title font color to be dark
    if (exportLayout.title) {
        if (typeof exportLayout.title === 'string') {
            exportLayout.title = { text: exportLayout.title, font: { color: '#0f172a' } };
        } else {
            exportLayout.title = {
                ...exportLayout.title,
                font: exportLayout.title.font ? { ...exportLayout.title.font, color: '#0f172a' } : { color: '#0f172a' }
            };
        }
    }
    
    // Force general font color to dark grey
    if (exportLayout.font) {
        exportLayout.font = { ...exportLayout.font, color: '#1e293b' };
    } else {
        exportLayout.font = { color: '#1e293b' };
    }
    
    // Adjust X axis colors (dark labels and grid lines)
    if (exportLayout.xaxis) {
        exportLayout.xaxis = {
            ...exportLayout.xaxis,
            gridcolor: '#e2e8f0',
            zerolinecolor: '#cbd5e1',
            tickfont: exportLayout.xaxis.tickfont ? { ...exportLayout.xaxis.tickfont, color: '#334155' } : { color: '#334155' },
            title: exportLayout.xaxis.title ? (typeof exportLayout.xaxis.title === 'string' ? { text: exportLayout.xaxis.title, font: { color: '#0f172a' } } : { ...exportLayout.xaxis.title, font: { color: '#0f172a', ...exportLayout.xaxis.title.font } }) : undefined
        };
    }
    
    // Adjust Y axis colors (dark labels and grid lines)
    if (exportLayout.yaxis) {
        exportLayout.yaxis = {
            ...exportLayout.yaxis,
            gridcolor: '#e2e8f0',
            zerolinecolor: '#cbd5e1',
            tickfont: exportLayout.yaxis.tickfont ? { ...exportLayout.yaxis.tickfont, color: '#334155' } : { color: '#334155' },
            title: exportLayout.yaxis.title ? (typeof exportLayout.yaxis.title === 'string' ? { text: exportLayout.yaxis.title, font: { color: '#0f172a' } } : { ...exportLayout.yaxis.title, font: { color: '#0f172a', ...exportLayout.yaxis.title.font } }) : undefined
        };
    }
    
    // Adjust Legend fonts
    if (exportLayout.legend) {
        exportLayout.legend = {
            ...exportLayout.legend,
            font: exportLayout.legend.font ? { ...exportLayout.legend.font, color: '#1e293b' } : { color: '#1e293b' }
        };
    }
    
    // Temporarily apply the light layout, capture the image, and revert
    Plotly.relayout(gd, exportLayout).then(() => {
        if (format === 'jpeg') {
            Plotly.downloadImage(gd, {
                format: 'jpeg',
                filename: filename,
                width: 1200,
                height: 800,
                setBackground: '#ffffff'
            }).then(() => {
                Plotly.relayout(gd, originalLayout);
            }).catch(err => {
                Plotly.relayout(gd, originalLayout);
                console.error(err);
            });
        } else if (format === 'pdf') {
            Plotly.toImage(gd, {
                format: 'jpeg',
                width: 1200,
                height: 800,
                quality: 1,
                setBackground: '#ffffff'
            }).then(dataUrl => {
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('landscape', 'px', [1200, 800]);
                pdf.addImage(dataUrl, 'JPEG', 0, 0, 1200, 800);
                pdf.save(`${filename}.pdf`);
                Plotly.relayout(gd, originalLayout);
            }).catch(err => {
                Plotly.relayout(gd, originalLayout);
                console.error(err);
                alert("PDF 생성 중 오류가 발생했습니다: " + err.message);
            });
        }
    });
}

function exportKeggMap(format, filename) {
    const container = document.getElementById("kegg-map-container");
    const wrapper = container.querySelector(".kegg-image-wrapper");
    if (!wrapper) {
        alert("선택 및 로드된 KEGG Pathway 지도가 없습니다.");
        return;
    }
    
    // Save original inline styles to restore after capture
    const originalWidthStyle = wrapper.style.width;
    const originalHeightStyle = wrapper.style.height;
    const originalOverflowStyle = wrapper.style.overflow;
    
    // Get full scrollable/renderable dimensions of the pathway map
    const fullWidth = wrapper.scrollWidth;
    const fullHeight = wrapper.scrollHeight;
    
    // Temporarily force wrapper size to fit the entire map to prevent clipping
    wrapper.style.width = `${fullWidth}px`;
    wrapper.style.height = `${fullHeight}px`;
    wrapper.style.overflow = "visible";
    
    html2canvas(wrapper, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: fullWidth,
        height: fullHeight,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        scale: 2 // Double scale for high-definition publication resolution
    }).then(canvas => {
        // Restore styles immediately
        wrapper.style.width = originalWidthStyle;
        wrapper.style.height = originalHeightStyle;
        wrapper.style.overflow = originalOverflowStyle;
        
        if (format === 'jpeg') {
            const link = document.createElement("a");
            link.download = `${filename}.jpg`;
            link.href = canvas.toDataURL("image/jpeg", 0.95);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (format === 'pdf') {
            const imgData = canvas.toDataURL("image/jpeg", 1.0);
            const imgWidth = canvas.width / 2; // Compensate scale: 2
            const imgHeight = canvas.height / 2;
            
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF(imgWidth > imgHeight ? 'l' : 'p', 'px', [imgWidth, imgHeight]);
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
            pdf.save(`${filename}.pdf`);
        }
    }).catch(err => {
        // Restore styles on error
        wrapper.style.width = originalWidthStyle;
        wrapper.style.height = originalHeightStyle;
        wrapper.style.overflow = originalOverflowStyle;
        console.error(err);
        alert("KEGG 지도 캡처 및 내보내기 실패: " + err.message);
    });
}

// ----------------------------------------------------------------------
// 13. Promoter Sequence Motif Discovery
// ----------------------------------------------------------------------
function renderMotifLogoPlaceholder() {
    const chartDiv = document.getElementById("motif-logo-chart");
    if (!chartDiv) return;
    
    chartDiv.innerHTML = `
        <div class="text-center text-muted" style="padding: 100px 0;">
            <i class="fa-solid fa-wand-magic-sparkles fa-3x mb-15" style="color: #cbd5e1;"></i>
            <p style="font-size: 14px; font-weight: 500;">상단 '모티프 분석 실행' 버튼을 눌러 프로모터 모티프를 도출하세요.</p>
        </div>
    `;
    
    document.getElementById("motif-consensus-text").textContent = "N/A";
    document.getElementById("motif-score-text").textContent = "N/A";
}

function runMotifAnalysis() {
    if (gGenes.length === 0) {
        alert("분석할 유전자 발현 데이터가 없습니다. 먼저 데이터를 로드해 주세요.");
        return;
    }
    
    const chartDiv = document.getElementById("motif-logo-chart");
    const lenSelect = document.getElementById("motif-len-select");
    const motifLen = lenSelect ? lenSelect.value : 8;
    
    chartDiv.innerHTML = `
        <div style="text-align: center; padding-top: 150px; color: #64748b;">
            <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
            <p style="margin-top: 10px; font-weight: 500;">프로모터 서열 획득 및 Gibbs Sampling 모티프 연산 중...</p>
        </div>
    `;
    
    // Calculate targetList based on current threshold
    const log2fcThresh = parseFloat(document.getElementById("log2fc-thresh").value) || 0;
    const pvalThresh = parseFloat(document.getElementById("pvalue-thresh").value) || 1.0;
    const statType = document.getElementById("stat-type") ? document.getElementById("stat-type").value : "fdr";
    const targetList = [];
    gGenes.forEach(gene => {
        const statVal = statType === "fdr" ? gene.fdr : gene.pvalue;
        const passesLog2FC = Math.abs(gene.log2fc) >= log2fcThresh;
        let passesPVal = true;
        if (statType !== "none" && gIsReplicateMode) {
            passesPVal = (statVal !== null && statVal <= pvalThresh);
        }
        if (passesLog2FC && passesPVal) {
            targetList.push(gene.locus_tag);
        }
    });

    if (targetList.length === 0) {
        chartDiv.innerHTML = `
            <div class="text-center text-warning" style="padding-top: 150px;">
                <i class="fa-solid fa-triangle-exclamation fa-2x mb-10"></i>
                <p>현재 필터 기준에 부합하는 유효한 DEG 유전자가 없습니다.<br>상단 필터 설정을 조정하여 유의미한 유전자를 확보해 주세요.</p>
            </div>
        `;
        return;
    }
    
    fetch(`${API_URL}/api/motif_discovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            genes: targetList,
            motif_len: parseInt(motifLen)
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success === false || !data.consensus) {
            chartDiv.innerHTML = `
                <div class="text-center text-danger" style="padding-top: 150px;">
                    <i class="fa-solid fa-circle-exclamation fa-2x mb-10"></i>
                    <p>모티프 분석 실패: ${data.detail || "서열 정보가 부족합니다."}</p>
                </div>
            `;
            return;
        }
        
        // Update summary text
        document.getElementById("motif-consensus-text").textContent = data.consensus || "N/A";
        document.getElementById("motif-score-text").textContent = `${data.score ? data.score.toFixed(3) : "0"} bits`;
        
        // Draw Sequence Logo stacked bar chart
        const logoData = data.logo || [];
        if (logoData.length === 0) {
            chartDiv.innerHTML = `<div class="text-center text-muted" style="padding-top: 150px;">모티프 데이터가 비어 있습니다.</div>`;
            return;
        }
        
        // Prepare arrays for Plotly traces
        const positions = logoData.map(d => `Pos ${d.position}`);
        const bitsA = logoData.map(d => d.heights ? d.heights.A || 0.0 : 0.0);
        const bitsC = logoData.map(d => d.heights ? d.heights.C || 0.0 : 0.0);
        const bitsG = logoData.map(d => d.heights ? d.heights.G || 0.0 : 0.0);
        const bitsT = logoData.map(d => d.heights ? d.heights.T || 0.0 : 0.0);
        
        // Trace A (Emerald Green)
        const traceA = {
            x: positions,
            y: bitsA,
            name: 'A',
            type: 'bar',
            marker: { color: '#10b981' },
            hovertemplate: 'Position %{x}<br>A: %{y:.3f} bits<extra></extra>'
        };
        
        // Trace C (Blue)
        const traceC = {
            x: positions,
            y: bitsC,
            name: 'C',
            type: 'bar',
            marker: { color: '#3b82f6' },
            hovertemplate: 'Position %{x}<br>C: %{y:.3f} bits<extra></extra>'
        };
        
        // Trace G (Orange/Amber)
        const traceG = {
            x: positions,
            y: bitsG,
            name: 'G',
            type: 'bar',
            marker: { color: '#f59e0b' },
            hovertemplate: 'Position %{x}<br>G: %{y:.3f} bits<extra></extra>'
        };
        
        // Trace T (Red)
        const traceT = {
            x: positions,
            y: bitsT,
            name: 'T',
            type: 'bar',
            marker: { color: '#ef4444' },
            hovertemplate: 'Position %{x}<br>T: %{y:.3f} bits<extra></extra>'
        };
        
        const layout = {
            title: {
                text: `Promoter Consensus Motif: "${data.consensus}" (Length: ${motifLen} bp)`,
                font: { size: 16, color: '#0f172a', family: 'Inter, sans-serif' }
            },
            xaxis: {
                title: 'Sequence Position (5\' -> 3\')',
                tickfont: { size: 12, color: '#475569' }
            },
            yaxis: {
                title: 'Information Content (Bits)',
                gridcolor: '#e2e8f0',
                range: [0, 2.1], // Maximum information content for DNA is 2 bits
                tickfont: { size: 12, color: '#475569' }
            },
            barmode: 'stack', // Stacked bars mock the sequence logo
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 60, r: 20, t: 60, b: 60 },
            legend: {
                orientation: 'h',
                yanchor: 'bottom',
                y: 1.02,
                xanchor: 'right',
                x: 1
            }
        };
        
        chartDiv.innerHTML = "";
        Plotly.newPlot('motif-logo-chart', [traceT, traceG, traceC, traceA], layout, {responsive: true});
    })
    .catch(err => {
        console.error("Motif 분석 중 오류 발생:", err);
        chartDiv.innerHTML = `
            <div class="text-center text-danger" style="padding-top: 150px;">
                <i class="fa-solid fa-circle-exclamation fa-2x mb-10"></i>
                <p>모티프 분석 오류: ${err.message}</p>
            </div>
        `;
    });
}

// ----------------------------------------------------------------------
// 10. Advanced Strain Analysis Integration
// ----------------------------------------------------------------------
function initAdvancedAnalysisBindings() {
    // Subtab toggles
    const subtabTfBtn = document.getElementById("btn-subtab-tf");
    const subtabBottleneckBtn = document.getElementById("btn-subtab-bottleneck");
    const subtabStressBtn = document.getElementById("btn-subtab-stress");
    const subtabReporterBtn = document.getElementById("btn-subtab-reporter");
    const subtabCandidateBtn = document.getElementById("btn-subtab-candidate");

    const tfArea = document.getElementById("subtab-tf-area");
    const bottleneckArea = document.getElementById("subtab-bottleneck-area");
    const stressArea = document.getElementById("subtab-stress-area");
    const reporterArea = document.getElementById("subtab-reporter-area");
    const candidateArea = document.getElementById("subtab-candidate-area");

    const resetSubtabs = () => {
        [subtabTfBtn, subtabBottleneckBtn, subtabStressBtn, subtabCandidateBtn].forEach(btn => {
            if (btn) {
                btn.classList.remove("active");
                btn.style.color = "var(--text-muted)";
                btn.style.borderColor = "var(--border-color)";
            }
        });
        [tfArea, bottleneckArea, stressArea, candidateArea].forEach(area => {
            if (area) area.style.display = "none";
        });
    };

    if (subtabTfBtn) {
        subtabTfBtn.addEventListener("click", () => {
            resetSubtabs();
            subtabTfBtn.classList.add("active");
            subtabTfBtn.style.color = "var(--text-primary)";
            subtabTfBtn.style.borderColor = "var(--primary-color)";
            if (tfArea) tfArea.style.display = "block";
        });
    }

    if (subtabBottleneckBtn) {
        subtabBottleneckBtn.addEventListener("click", () => {
            resetSubtabs();
            subtabBottleneckBtn.classList.add("active");
            subtabBottleneckBtn.style.color = "var(--text-primary)";
            subtabBottleneckBtn.style.borderColor = "var(--primary-color)";
            if (bottleneckArea) bottleneckArea.style.display = "block";
            populateBottleneckPathwayDropdown();
        });
    }

    if (subtabStressBtn) {
        subtabStressBtn.addEventListener("click", () => {
            resetSubtabs();
            subtabStressBtn.classList.add("active");
            subtabStressBtn.style.color = "var(--text-primary)";
            subtabStressBtn.style.borderColor = "var(--primary-color)";
            if (stressArea) stressArea.style.display = "block";
        });
    }



    if (subtabCandidateBtn) {
        subtabCandidateBtn.addEventListener("click", () => {
            resetSubtabs();
            subtabCandidateBtn.classList.add("active");
            subtabCandidateBtn.style.color = "var(--text-primary)";
            subtabCandidateBtn.style.borderColor = "var(--primary-color)";
            if (candidateArea) candidateArea.style.display = "block";
            populateCandidateCategories();
        });
    }

    // Action button listeners
    const btnRunTf = document.getElementById("btn-run-tf-analysis");
    if (btnRunTf) btnRunTf.addEventListener("click", runTFActivityAnalysis);

    const btnRunBottleneck = document.getElementById("btn-run-bottleneck");
    if (btnRunBottleneck) btnRunBottleneck.addEventListener("click", runMetabolicBottleneckScan);

    const btnRunStress = document.getElementById("btn-run-stress-prediction");
    if (btnRunStress) btnRunStress.addEventListener("click", runStressSpectrumPrediction);



    // Candidate Target & Bypass Enzyme Finder bindings
    initCandidateTargetFinderBindings();

    // Toggle WT / Mutant traces in stress radar chart
    const btnToggleWT = document.getElementById("btn-stress-toggle-wt");
    const btnToggleMut = document.getElementById("btn-stress-toggle-mut");

    if (btnToggleWT) {
        btnToggleWT.addEventListener("click", () => {
            btnToggleWT.classList.toggle("active");
            renderStressRadarChart();
        });
    }

    if (btnToggleMut) {
        btnToggleMut.addEventListener("click", () => {
            btnToggleMut.classList.toggle("active");
            renderStressRadarChart();
        });
    }
}

// 1) TF Activity Analysis
function runTFActivityAnalysis() {
    const chartDiv = document.getElementById("tf-activity-chart");
    chartDiv.innerHTML = `<div style="text-align:center; padding-top:150px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">전사인자 활성 추론 계산 중...</p></div>`;

    fetch(`${API_URL}/api/tf_activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
    })
    .then(res => {
        if (!res.ok) throw new Error("TF 분석 API 실패");
        return res.json();
    })
    .then(data => {
        if (!data.success || data.results.length === 0) {
            chartDiv.innerHTML = `<div style="text-align:center; padding-top:150px; color:#ef4444;">유의한 전사인자 표적 농축 결과를 도출하지 못했습니다.</div>`;
            return;
        }

        const results = data.results;
        const tfNames = results.map(r => r.tf);
        const scores = results.map(r => r.score);
        const colors = scores.map(s => s >= 0 ? 'rgba(99, 102, 241, 0.85)' : 'rgba(239, 68, 68, 0.85)');

        const trace = {
            x: scores,
            y: tfNames,
            type: 'bar',
            orientation: 'h',
            marker: {
                color: colors,
                line: { color: 'rgba(0, 0, 0, 0.1)', width: 1 }
            },
            text: scores.map(s => `${s >= 0 ? '+' : ''}${s}`),
            textposition: 'auto',
            customdata: results
        };

        const layout = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: {
                title: '활성 활성화도 지수 (PSRS Score)',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#cbd5e1'
            },
            yaxis: {
                autorange: 'reversed',
                gridcolor: '#e2e8f0'
            },
            margin: { l: 80, r: 30, t: 10, b: 60 }
        };

        chartDiv.innerHTML = "";
        const myPlot = document.createElement("div");
        myPlot.style.width = "100%";
        myPlot.style.height = "100%";
        chartDiv.appendChild(myPlot);

        Plotly.newPlot(myPlot, [trace], layout, {responsive: true});

        myPlot.on('plotly_click', function(clickData) {
            const point = clickData.points[0];
            const tfData = point.customdata;
            displayTfTargetDEGs(tfData);
        });

        displayTfTargetDEGs(results[0]);
    })
    .catch(err => {
        console.error(err);
        chartDiv.innerHTML = `<div style="text-align:center; padding-top:150px; color:#ef4444;">오류 발생: ${err.message}</div>`;
    });
}

function displayTfTargetDEGs(tfData) {
    document.getElementById("tf-selected-desc").innerHTML = `
        <strong>${tfData.tf}</strong>: ${tfData.description}<br>
        <span class="text-muted" style="font-size:11px;">P-value: ${tfData.p_value.toExponential(3)} | 상태: <span style="font-weight:bold; color:${tfData.state==='Activated'?'#4f46e5':'#dc2626'}">${tfData.state}</span></span>
    `;

    const container = document.getElementById("tf-target-list-container");
    container.innerHTML = "";

    if (tfData.target_degs.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#94a3b8; padding-top:40px; font-size:12px;">유의미한 표적 발현 유전자(DEG)가 존재하지 않습니다.</div>`;
        return;
    }

    tfData.target_degs.forEach(sym => {
        const row = document.createElement("div");
        row.className = "tf-gene-row";
        
        const matched = gGenes.find(g => g.gene_symbol.toUpperCase() === sym.toUpperCase());
        const log2fc = matched ? matched.log2fc : 0.0;
        const colorClass = log2fc >= 0 ? "up-text" : "down-text";

        row.innerHTML = `
            <span><strong>${sym}</strong></span>
            <span class="${colorClass}" style="font-weight:bold;">${log2fc > 0 ? '+' : ''}${log2fc} Log2FC</span>
        `;
        container.appendChild(row);
    });
}

// 2) Metabolic Bottleneck Scan
function populateBottleneckPathwayDropdown() {
    const select = document.getElementById("bottleneck-pathway-select");
    if (!select) return;
    if (select.children.length > 0) return;

    fetch(`${API_URL}/api/pathways`)
    .then(res => res.json())
    .then(data => {
        select.innerHTML = "";
        data.pathways.forEach(path => {
            const opt = document.createElement("option");
            opt.value = path.pathway_id;
            opt.textContent = `${path.pathway_id.replace("path:", "")} - ${path.description.length > 25 ? path.description.substring(0, 25) + '...' : path.description}`;
            select.appendChild(opt);
        });
    })
    .catch(err => console.error("KEGG 목록 로드 실패:", err));
}

function runMetabolicBottleneckScan() {
    const select = document.getElementById("bottleneck-pathway-select");
    if (!select) return;
    const pathwayId = select.value;

    const tbody = document.getElementById("bottleneck-table-body");
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:50px 0;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">대사 경로 병목 지점 스캔 중...</p></td></tr>`;

    fetch(`${API_URL}/api/metabolic_bottleneck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathway_id: pathwayId })
    })
    .then(res => {
        if (!res.ok) throw new Error("병목 분석 API 실패");
        return res.json();
    })
    .then(data => {
        tbody.innerHTML = "";
        if (!data.success || data.candidates.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:40px 0;">본 경로에는 임계 범위 내에 걸려있는 병목 의심 유전자가 검출되지 않았습니다.</td></tr>`;
            return;
        }

        data.candidates.forEach(cand => {
            const row = document.createElement("tr");
            const classSeverity = cand.severity === "High" ? "severity-high" : "severity-medium";
            
            row.innerHTML = `
                <td><code>${cand.locus_tag}</code></td>
                <td><strong>${cand.gene_symbol}</strong></td>
                <td>${cand.wt_val}</td>
                <td>${cand.mutant_val}</td>
                <td class="${cand.log2fc >= 0 ? 'up-text' : 'down-text'}">${cand.log2fc > 0 ? '+' : ''}${cand.log2fc}</td>
                <td style="color:#475569; font-size:12px;">${cand.reason}</td>
                <td><span class="${classSeverity}">${cand.severity}</span></td>
                <td style="font-size:12px; color:#1e293b; line-height:1.4;">${cand.guide}</td>
            `;
            tbody.appendChild(row);
        });
    })
    .catch(err => {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ef4444; padding:40px 0;">분석 실패: ${err.message}</td></tr>`;
    });
}

// 3) Stress Spectrum Prediction (Radar Chart)
let gLastStressData = null;

function runStressSpectrumPrediction() {
    const chartDiv = document.getElementById("stress-radar-chart");
    chartDiv.innerHTML = `<div style="text-align:center; padding-top:130px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">스트레스 저항성 판정 연산 중...</p></div>`;

    const reportContainer = document.getElementById("stress-report-container");
    reportContainer.innerHTML = "";

    fetch(`${API_URL}/api/stress_prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
    })
    .then(res => {
        if (!res.ok) throw new Error("스트레스 분석 API 실패");
        return res.json();
    })
    .then(data => {
        if (!data.success || data.profiles.length === 0) {
            chartDiv.innerHTML = `<div style="text-align:center; padding-top:130px; color:#ef4444;">유효한 매칭 데이터를 확보하지 못했습니다.</div>`;
            return;
        }

        gLastStressData = data.profiles;
        
        // Render Chart based on toggles
        renderStressRadarChart();

        // Render Report
        data.profiles.forEach(p => {
            const card = document.createElement("div");
            card.style.border = "1px solid var(--border-color)";
            card.style.borderRadius = "8px";
            card.style.padding = "12px";
            card.style.background = "#ffffff";
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong>${p.name}</strong>
                    <span class="${p.class_name}">${p.status} (PSRS: ${p.score})</span>
                </div>
                <p style="font-size:12px; color:#475569; line-height:1.4; margin-bottom:0;">${p.verdict}</p>
            `;
            reportContainer.appendChild(card);
        });
    })
    .catch(err => {
        console.error(err);
        chartDiv.innerHTML = `<div style="text-align:center; padding-top:130px; color:#ef4444;">오류: ${err.message}</div>`;
    });
}

function renderStressRadarChart() {
    const chartDiv = document.getElementById("stress-radar-chart");
    if (!gLastStressData || gLastStressData.length === 0) return;

    const btnWT = document.getElementById("btn-stress-toggle-wt");
    const btnMut = document.getElementById("btn-stress-toggle-mut");

    const showWT = btnWT ? btnWT.classList.contains("active") : true;
    const showMut = btnMut ? btnMut.classList.contains("active") : true;

    // Styles update based on active class
    if (btnWT) {
        if (showWT) {
            btnWT.style.background = "#fef2f2";
            btnWT.style.color = "#dc2626";
            btnWT.style.borderColor = "#fca5a5";
        } else {
            btnWT.style.background = "#ffffff";
            btnWT.style.color = "var(--text-muted)";
            btnWT.style.borderColor = "var(--border-color)";
        }
    }
    if (btnMut) {
        if (showMut) {
            btnMut.style.background = "#e0e7ff";
            btnMut.style.color = "#4f46e5";
            btnMut.style.borderColor = "#a5b4fc";
        } else {
            btnMut.style.background = "#ffffff";
            btnMut.style.color = "var(--text-muted)";
            btnMut.style.borderColor = "var(--border-color)";
        }
    }

    const thetaVals = gLastStressData.map(p => p.name);
    thetaVals.push(thetaVals[0]); // circular wrap-around

    const traces = [];

    // 1) Wild-Type Trace (Red)
    if (showWT) {
        const wtScores = Array(gLastStressData.length + 1).fill(0.0);
        traces.push({
            type: 'scatterpolar',
            r: wtScores,
            theta: thetaVals,
            name: '야생형 (WT)',
            fill: 'toself',
            fillcolor: 'rgba(239, 68, 68, 0.12)',
            line: { color: 'rgba(239, 68, 68, 0.85)', width: 2 },
            marker: { size: 6 }
        });
    }

    // 2) Mutant Trace (Indigo/Blue)
    if (showMut) {
        const mutScores = gLastStressData.map(p => p.score);
        mutScores.push(mutScores[0]);
        traces.push({
            type: 'scatterpolar',
            r: mutScores,
            theta: thetaVals,
            name: '변이주 (Mutant)',
            fill: 'toself',
            fillcolor: 'rgba(99, 102, 241, 0.12)',
            line: { color: 'rgba(99, 102, 241, 0.85)', width: 2 },
            marker: { size: 6 }
        });
    }

    const layout = {
        polar: {
            radialaxis: {
                visible: true,
                range: [-10, 10],
                gridcolor: '#e2e8f0',
                zerolinecolor: '#cbd5e1'
            },
            angularaxis: {
                gridcolor: '#e2e8f0'
            }
        },
        paper_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 45, r: 45, t: 30, b: 30 },
        showlegend: false
    };

    chartDiv.innerHTML = "";
    const myPlot = document.createElement("div");
    myPlot.style.width = "100%";
    myPlot.style.height = "100%";
    chartDiv.appendChild(myPlot);

    Plotly.newPlot(myPlot, traces, layout, {responsive: true});
}

// 5) Candidate Target & Bypass Enzyme Finder
let gCandidateScanMode = "reference";
let gLastCandidateScanData = null;

function initCandidateTargetFinderBindings() {
    const modeBtns = document.querySelectorAll(".cand-mode-btn");
    const panelRef = document.getElementById("cand-panel-reference");
    const panelAct = document.getElementById("cand-panel-activity");
    const onlySwitchChk = document.getElementById("cand-only-on-switch");

    modeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            gCandidateScanMode = btn.getAttribute("data-mode") || "reference";
            modeBtns.forEach(b => {
                b.classList.remove("active");
                b.style.background = "#ffffff";
                b.style.color = "#475569";
                b.style.borderColor = "#cbd5e1";
            });
            btn.classList.add("active");
            btn.style.background = "#eef2ff";
            btn.style.color = "#4338ca";
            btn.style.borderColor = "#6366f1";

            if (panelRef) panelRef.style.display = (gCandidateScanMode === "reference") ? "block" : "none";
            if (panelAct) panelAct.style.display = (gCandidateScanMode === "activity") ? "block" : "none";
            if (gCandidateScanMode === "on_off" && onlySwitchChk) {
                onlySwitchChk.checked = true;
            }
        });
    });

    // Reference preset buttons
    document.querySelectorAll(".cand-preset-ref").forEach(btn => {
        btn.addEventListener("click", () => {
            const genes = btn.getAttribute("data-genes") || "";
            const input = document.getElementById("cand-ref-genes-input");
            if (input) input.value = genes;
            runCandidateTargetScan();
        });
    });

    // Quick activity buttons
    document.querySelectorAll(".cand-quick-act").forEach(btn => {
        btn.addEventListener("click", () => {
            const goid = btn.getAttribute("data-goid") || "GO:0016791";
            const select = document.getElementById("cand-activity-select");
            if (select) select.value = goid;
            runCandidateTargetScan();
        });
    });

    const btnRun = document.getElementById("btn-run-candidate-scan");
    if (btnRun) {
        btnRun.addEventListener("click", runCandidateTargetScan);
    }

    const btnExportCsv = document.getElementById("btn-export-cand-csv");
    if (btnExportCsv) {
        btnExportCsv.addEventListener("click", exportCandidateTargetsToCSV);
    }
}

function populateCandidateCategories() {
    const select = document.getElementById("cand-activity-select");
    if (!select) return;

    const sidParam = gActiveSessionId ? `?session_id=${encodeURIComponent(gActiveSessionId)}&species=${encodeURIComponent(gCurrentSpecies || 'sce')}` : `?species=${encodeURIComponent(gCurrentSpecies || 'sce')}`;
    fetch(`${API_URL}/api/candidate_targets/categories${sidParam}`)
    .then(res => res.json())
    .then(data => {
        if (!data.success) return;

        const ctrlName = data.control_name || "WT";
        const treatName = data.treated_name || "Mutant";
        const groupLabel = document.getElementById("cand-chart-group-label");
        if (groupLabel) groupLabel.textContent = `${ctrlName} vs ${treatName}`;
        const thWt = document.getElementById("cand-th-wt");
        if (thWt) thWt.textContent = `${ctrlName} 발현량 (백분위)`;
        const thMut = document.getElementById("cand-th-mut");
        if (thMut) thMut.textContent = `${treatName} 발현량 (백분위)`;

        const curVal = select.value || "GO:0016791";
        select.innerHTML = "";

        const optAll = document.createElement("option");
        optAll.value = "all";
        optAll.textContent = "🌐 전체 유전자 / 키워드 자유 검색";
        select.appendChild(optAll);

        if (data.mol_functions && data.mol_functions.length > 0) {
            const grpF = document.createElement("optgroup");
            grpF.label = "🧪 분자 기능 / 효소 활성 (GO Molecular Function)";
            data.mol_functions.forEach(item => {
                const opt = document.createElement("option");
                opt.value = item.goid;
                opt.textContent = `${item.goid} - ${item.name} (${item.count}개 유전자)`;
                grpF.appendChild(opt);
            });
            select.appendChild(grpF);
        }

        if (data.bio_processes && data.bio_processes.length > 0) {
            const grpP = document.createElement("optgroup");
            grpP.label = "🔄 생물학적 대사 과정 (GO Biological Process)";
            data.bio_processes.forEach(item => {
                const opt = document.createElement("option");
                opt.value = item.goid;
                opt.textContent = `${item.goid} - ${item.name} (${item.count}개 유전자)`;
                grpP.appendChild(opt);
            });
            select.appendChild(grpP);
        }

        // Restore selection if available
        if ([...select.options].some(o => o.value === curVal)) {
            select.value = curVal;
        } else if ([...select.options].some(o => o.value === "GO:0016791")) {
            select.value = "GO:0016791";
        }
    })
    .catch(err => console.error("Failed to load candidate categories:", err));
}

function runCandidateTargetScan() {
    const chartDiv = document.getElementById("cand-scatter-chart");
    const tbody = document.getElementById("cand-results-tbody");
    const banner = document.getElementById("cand-ref-diagnostic-banner");

    const refGenes = document.getElementById("cand-ref-genes-input") ? document.getElementById("cand-ref-genes-input").value.trim() : "";
    const actGoid = document.getElementById("cand-activity-select") ? document.getElementById("cand-activity-select").value : "all";
    const direction = document.getElementById("cand-direction-select") ? document.getElementById("cand-direction-select").value : "up";
    const wtMax = parseFloat(document.getElementById("cand-wt-max-input")?.value) || 5.0;
    const mutMin = parseFloat(document.getElementById("cand-mut-min-input")?.value) || 10.0;
    const minFc = parseFloat(document.getElementById("cand-min-fc-input")?.value) || 0.5;
    const keyword = document.getElementById("cand-keyword-input") ? document.getElementById("cand-keyword-input").value.trim() : "";
    const onlyOnSwitch = document.getElementById("cand-only-on-switch") ? document.getElementById("cand-only-on-switch").checked : false;

    if (gCandidateScanMode === "reference" && !refGenes) {
        showGshToast("기준(Reference) 유전자를 1개 이상 입력해주세요 (예: ISN1, SDT1, PHO8).");
        return;
    }

    if (chartDiv) {
        chartDiv.innerHTML = `<div style="text-align:center; color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px;">유전체 기능 주석(GO/EC/도메인) 및 On/Off 발현 전환 스캔 중...</p></div>`;
    }
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:45px 0; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> 후보 유전자 랭킹 연산 중...</td></tr>`;
    }

    fetch(`${API_URL}/api/candidate_targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            session_id: gActiveSessionId,
            species: gCurrentSpecies || "sce",
            mode: gCandidateScanMode,
            reference_genes: refGenes,
            activity_goid: actGoid,
            keyword: keyword,
            direction: direction,
            only_on_switch: onlyOnSwitch,
            wt_max_cutoff: wtMax,
            mut_min_cutoff: mutMin,
            min_abs_log2fc: minFc
        })
    })
    .then(res => {
        if (!res.ok) throw new Error("타겟 후보 발굴 API 호출 실패");
        return res.json();
    })
    .then(data => {
        if (!data.success) {
            throw new Error(data.detail || "결과를 생성하지 못했습니다.");
        }
        gLastCandidateScanData = data;

        const ctrlName = data.control_name || "WT";
        const treatName = data.treated_name || "Mutant";
        const groupLabel = document.getElementById("cand-chart-group-label");
        if (groupLabel) groupLabel.textContent = `${ctrlName} vs ${treatName}`;
        const thWt = document.getElementById("cand-th-wt");
        if (thWt) thWt.textContent = `${ctrlName} 발현량 (백분위)`;
        const thMut = document.getElementById("cand-th-mut");
        if (thMut) thMut.textContent = `${treatName} 발현량 (백분위)`;

        // Render Reference Diagnostic Banner if in reference mode
        renderCandidateRefBanner(data);

        // Render Scatter Plot
        renderCandidateScatterChart(data, wtMax, mutMin);

        // Render Table
        renderCandidateResultsTable(data);

        // Auto-select #1 candidate in detail box
        if (data.candidates && data.candidates.length > 0) {
            renderCandidateDetailBox(data.candidates[0], ctrlName, treatName);
        } else if (data.reference_profiles && data.reference_profiles.length > 0) {
            renderCandidateDetailBox(data.reference_profiles[0], ctrlName, treatName);
        }
    })
    .catch(err => {
        console.error(err);
        if (chartDiv) chartDiv.innerHTML = `<div style="text-align:center; color:#ef4444;">오류: ${err.message}</div>`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#ef4444; padding:40px 0;">분석 실패: ${err.message}</td></tr>`;
        if (banner) banner.style.display = "none";
    });
}

function renderCandidateRefBanner(data) {
    const banner = document.getElementById("cand-ref-diagnostic-banner");
    const refContainer = document.getElementById("cand-ref-genes-badges");
    const funcContainer = document.getElementById("cand-shared-func-badges");
    if (!banner || !refContainer || !funcContainer) return;

    if (data.mode !== "reference" || !data.reference_profiles || data.reference_profiles.length === 0) {
        banner.style.display = "none";
        return;
    }

    banner.style.display = "block";
    refContainer.innerHTML = "";
    funcContainer.innerHTML = "";

    const ctrlName = data.control_name || "WT";
    const treatName = data.treated_name || "Mutant";

    data.reference_profiles.forEach(ref => {
        const fc = ref.log2fc;
        const fcSign = fc > 0 ? "+" : "";
        const fcColor = fc >= 0.8 ? "#dc2626" : (fc <= -0.8 ? "#2563eb" : "#475569");
        const pill = document.createElement("div");
        pill.style.cssText = "background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:6px 10px; font-size:11px; display:flex; align-items:center; gap:8px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.03);";
        pill.title = "클릭하여 우측 패널에서 상세 정보 확인";
        pill.innerHTML = `
            <span style="background:#e0e7ff; color:#3730a3; font-weight:700; padding:1px 6px; border-radius:4px; font-size:10px;">REF</span>
            <strong>${ref.gene_symbol}</strong> <code style="font-size:10px; color:#64748b;">(${ref.locus_tag})</code>
            <span style="color:#334155;">${ctrlName}: <b>${ref.wt_val}</b> → ${treatName}: <b>${ref.mutant_val}</b></span>
            <span style="font-weight:700; color:${fcColor};">(${fcSign}${fc} Log2FC)</span>
        `;
        pill.addEventListener("click", () => renderCandidateDetailBox(ref, ctrlName, treatName));
        refContainer.appendChild(pill);
    });

    if (data.shared_functions && data.shared_functions.length > 0) {
        data.shared_functions.forEach(sf => {
            const badge = document.createElement("span");
            badge.style.cssText = "background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:600;";
            badge.innerHTML = `<i class="fa-solid fa-bolt" style="color:#10b981; margin-right:4px;"></i>${sf.name} (<code>${sf.goid}</code>, ${sf.count}/${data.reference_profiles.length} 일치)`;
            funcContainer.appendChild(badge);
        });
    }
    if (data.shared_ec_prefixes && data.shared_ec_prefixes.length > 0) {
        data.shared_ec_prefixes.forEach(ec => {
            const badge = document.createElement("span");
            badge.style.cssText = "background:#fef3c7; border:1px solid #fde68a; color:#92400e; padding:4px 9px; border-radius:6px; font-size:11px; font-weight:600;";
            badge.innerHTML = `<i class="fa-solid fa-flask" style="color:#f59e0b; margin-right:4px;"></i>효소 분류: EC ${ec}.-`;
            funcContainer.appendChild(badge);
        });
    }
}

function renderCandidateScatterChart(data, wtMaxCutoff, mutMinCutoff) {
    const chartDiv = document.getElementById("cand-scatter-chart");
    if (!chartDiv) return;

    const pool = data.pool_genes || [];
    const candMap = new Map((data.candidates || []).map((c, idx) => [c.locus_tag, { ...c, rank: idx + 1 }]));
    const ctrlName = data.control_name || "WT";
    const treatName = data.treated_name || "Mutant";

    if (pool.length === 0 && (!data.candidates || data.candidates.length === 0)) {
        chartDiv.innerHTML = `<div style="text-align:center; color:#94a3b8;">조건에 부합하는 유전자가 없습니다. 필터 임계값을 완화해보세요.</div>`;
        return;
    }

    const onSwitchPts = [];
    const topCandPts = [];
    const refPts = [];
    const bgPts = [];

    pool.forEach(g => {
        const xVal = Math.log10((g.wt_val || 0) + 1.0);
        const yVal = Math.log10((g.mutant_val || 0) + 1.0);
        const cObj = candMap.get(g.locus_tag) || g;
        const labelSym = g.is_unnamed_orf && g.ncbi_id ? `${g.locus_tag} (NCBI:${g.ncbi_id})` : g.gene_symbol;
        const pt = { x: xVal, y: yVal, label: labelSym, gene: cObj };

        if (g.is_reference) {
            refPts.push(pt);
        } else if (g.is_de_novo_on || g.is_de_novo_off) {
            onSwitchPts.push(pt);
        } else if (candMap.has(g.locus_tag)) {
            topCandPts.push(pt);
        } else {
            bgPts.push(pt);
        }
    });

    const makeTrace = (pts, name, color, size, symbol, showText = false) => ({
        x: pts.map(p => p.x),
        y: pts.map(p => p.y),
        mode: showText ? "markers+text" : "markers",
        type: "scatter",
        name: name,
        text: pts.map(p => p.label),
        textposition: "top center",
        textfont: { size: 11, color: "#0f172a", family: "Inter, sans-serif" },
        hovertemplate: pts.map(p =>
            `<b>${p.label}</b> (${p.gene.locus_tag})<br>` +
            `${ctrlName}: ${p.gene.wt_val} (백분위 ${p.gene.wt_pct}%)<br>` +
            `${treatName}: ${p.gene.mutant_val} (백분위 ${p.gene.mut_pct}%)<br>` +
            `Log2FC: ${p.gene.log2fc > 0 ? '+' : ''}${p.gene.log2fc}<br>` +
            `${p.gene.func_summary.substring(0, 70)}<extra></extra>`
        ),
        marker: {
            size: size,
            color: color,
            symbol: symbol,
            line: { color: "#ffffff", width: 1.2 }
        },
        customdata: pts.map(p => p.gene)
    });

    const traces = [];
    if (bgPts.length > 0) traces.push(makeTrace(bgPts, "동일 기능군 기타 유전자", "rgba(148, 163, 184, 0.55)", 7, "circle", false));
    if (topCandPts.length > 0) traces.push(makeTrace(topCandPts, "⚡ 발현 증가 후보", "#f59e0b", 10, "circle", topCandPts.length <= 12));
    if (refPts.length > 0) traces.push(makeTrace(refPts, "📌 기준(Reference) 유전자", "#3b82f6", 12, "diamond", true));
    if (onSwitchPts.length > 0) traces.push(makeTrace(onSwitchPts, "🔥 De novo On/Off 스위치", "#ef4444", 14, "star", true));

    const allX = pool.map(g => Math.log10((g.wt_val || 0) + 1.0));
    const allY = pool.map(g => Math.log10((g.mutant_val || 0) + 1.0));
    const maxCoord = Math.max(3.0, ...allX, ...allY) * 1.08;

    const xCut = Math.log10((wtMaxCutoff || 5.0) + 1.0);
    const yCut = Math.log10((mutMinCutoff || 10.0) + 1.0);

    const layout = {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "#ffffff",
        margin: { l: 55, r: 20, t: 30, b: 50 },
        xaxis: {
            title: `${ctrlName} 발현량 — Log10(Expr + 1)`,
            range: [-0.15, maxCoord],
            gridcolor: "#f1f5f9",
            zerolinecolor: "#cbd5e1"
        },
        yaxis: {
            title: `${treatName} 발현량 — Log10(Expr + 1)`,
            range: [-0.15, maxCoord],
            gridcolor: "#f1f5f9",
            zerolinecolor: "#cbd5e1"
        },
        legend: { orientation: "h", y: 1.12, x: 0, font: { size: 11 } },
        hovermode: "closest",
        shapes: [
            // y = x diagonal line
            {
                type: "line",
                x0: 0, y0: 0, x1: maxCoord, y1: maxCoord,
                line: { color: "#94a3b8", width: 1, dash: "dot" }
            },
            // Highlight box for De novo On-Switch zone (WT <= wtMaxCutoff & Mutant >= mutMinCutoff)
            {
                type: "rect",
                x0: -0.12, x1: xCut,
                y0: yCut, y1: maxCoord * 0.98,
                fillcolor: "rgba(239, 68, 68, 0.06)",
                line: { color: "rgba(239, 68, 68, 0.35)", width: 1, dash: "dash" }
            }
        ],
        annotations: [
            {
                x: xCut / 2,
                y: maxCoord * 0.93,
                text: "🔥 On-Switch 구역",
                showarrow: false,
                font: { size: 10, color: "#dc2626" }
            }
        ]
    };

    chartDiv.innerHTML = "";
    const plotEl = document.createElement("div");
    plotEl.style.width = "100%";
    plotEl.style.height = "100%";
    chartDiv.appendChild(plotEl);

    Plotly.newPlot(plotEl, traces, layout, { responsive: true });

    plotEl.on("plotly_click", (clickData) => {
        if (clickData.points && clickData.points[0] && clickData.points[0].customdata) {
            const gObj = clickData.points[0].customdata;
            renderCandidateDetailBox(gObj, ctrlName, treatName);
        }
    });
}

function renderCandidateDetailBox(gene, ctrlName = "WT", treatName = "Mutant") {
    const box = document.getElementById("cand-selected-detail-box");
    if (!box || !gene) return;

    const uniprotUrl = getUniprotUrl(gene);
    const sgdUrl = `https://www.yeastgenome.org/locus/${encodeURIComponent(gene.locus_tag)}`;
    const fcSign = gene.log2fc > 0 ? "+" : "";
    const fcColor = gene.log2fc >= 0.5 ? "#dc2626" : (gene.log2fc <= -0.5 ? "#2563eb" : "#334155");

    const unnamedAlert = gene.is_unnamed_orf
        ? `<div style="background:#fffbeb; border:1px solid #fde68a; color:#92400e; padding:6px 10px; border-radius:6px; font-size:11px; margin-bottom:10px;">
               <i class="fa-solid fa-lightbulb" style="color:#f59e0b; margin-right:4px;"></i>
               <b>숨겨진 후보 알림:</b> 이 유전자는 표준 3글자 심볼이 부여되지 않아 체계명(<code>${gene.locus_tag}</code>${gene.ncbi_id ? ` / NCBI: <code>${gene.ncbi_id}</code>` : ""})으로만 표기되므로 기존 주요 유전자 위주 검토에서 누락되기 쉬운 <b>Known-function 미명명 ORF</b>입니다.
           </div>`
        : "";

    const mfTags = (gene.mol_functions || []).map(x => `<span style="background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:600;">${x.name} (${x.goid})</span>`).join(" ");
    const ecTags = (gene.ec_numbers || []).map(ec => `<span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:600;">EC ${ec}</span>`).join(" ");
    const bpTags = (gene.bio_processes || []).map(x => `<span style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:2px 7px; border-radius:4px; font-size:11px;">${x.name}</span>`).join(" ");
    const ccTags = (gene.cell_components || []).map(x => `<span style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; padding:2px 7px; border-radius:4px; font-size:11px;">📍 ${x.name}</span>`).join(" ");

    const safeNoteKO = `${treatName} 특이 발현 우회 효소 후보 (${ctrlName}:${gene.wt_val} -> ${treatName}:${gene.mutant_val}, Log2FC:${fcSign}${gene.log2fc})`.replace(/'/g, "");
    const safeNoteOE = `${treatName} 과발현 검증 타겟 (${ctrlName}:${gene.wt_val} -> ${treatName}:${gene.mutant_val}, Log2FC:${fcSign}${gene.log2fc})`.replace(/'/g, "");
    const targetSymbol = (gene.gene_symbol && !gene.gene_symbol.match(/^\d+$/)) ? gene.gene_symbol : gene.locus_tag;

    box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; height:100%; justify-content:space-between;">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span style="font-size:18px; font-weight:800; color:#0f172a;">${targetSymbol}</span>
                            <code style="font-size:12px; background:#e2e8f0; padding:2px 6px; border-radius:4px; color:#334155;">${gene.locus_tag}</code>
                            ${gene.ncbi_id ? `<span style="font-size:11px; color:#64748b;">(NCBI ID: ${gene.ncbi_id})</span>` : ""}
                            ${gene.candidate_score ? `<span style="background:#4f46e5; color:#ffffff; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">Score: ${gene.candidate_score}</span>` : ""}
                        </div>
                        <div style="margin-top:4px; font-size:11px; font-weight:600; color:#dc2626;">${gene.switch_label || ""}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${gCurrentSpecies === "sce" ? `<a href="${sgdUrl}" target="_blank" class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:11px; text-decoration:none;">SGD DB ↗</a>` : ""}
                        <a href="${uniprotUrl}" target="_blank" class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:11px; text-decoration:none;">UniProt ↗</a>
                    </div>
                </div>

                ${unnamedAlert}

                <!-- Expression Comparison Box -->
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; text-align:center;">
                        <div style="font-size:10px; color:#64748b; font-weight:600;">${ctrlName} (대조군)</div>
                        <div style="font-size:15px; font-weight:800; color:#1e293b; margin-top:2px;">${gene.wt_val}</div>
                        <div style="font-size:10px; color:#94a3b8;">백분위 ${gene.wt_pct}%</div>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; text-align:center;">
                        <div style="font-size:10px; color:#64748b; font-weight:600;">${treatName} (실험군)</div>
                        <div style="font-size:15px; font-weight:800; color:#dc2626; margin-top:2px;">${gene.mutant_val}</div>
                        <div style="font-size:10px; color:#94a3b8;">백분위 ${gene.mut_pct}% (${gene.pct_jump >= 0 ? "+" : ""}${gene.pct_jump}%p)</div>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; text-align:center;">
                        <div style="font-size:10px; color:#64748b; font-weight:600;">Log2 FC / FDR</div>
                        <div style="font-size:15px; font-weight:800; color:${fcColor}; margin-top:2px;">${fcSign}${gene.log2fc}</div>
                        <div style="font-size:10px; color:#94a3b8;">FDR: ${gene.fdr !== null && gene.fdr !== undefined ? gene.fdr : "-"}</div>
                    </div>
                </div>

                <!-- Functional Annotations -->
                <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:10px; font-size:11px; line-height:1.6;">
                    <div style="margin-bottom:6px;">
                        <strong style="color:#1e293b;">🧪 분자 기능 & EC 번호:</strong>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:3px;">
                            ${mfTags || `<span style="color:#94a3b8;">등록된 분자 기능 없음</span>`}
                            ${ecTags}
                        </div>
                    </div>
                    <div style="margin-bottom:6px;">
                        <strong style="color:#1e293b;">🔄 연관 대사 과정 & 세포 내 위치:</strong>
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:3px;">
                            ${bpTags || `<span style="color:#94a3b8;">미등록</span>`}
                            ${ccTags}
                        </div>
                    </div>
                    ${gene.engineering_note ? `<div style="margin-top:6px; padding-top:6px; border-top:1px dashed #e2e8f0; color:#334155;"><b>💡 대사공학 진단:</b> ${gene.engineering_note}</div>` : ""}
                </div>
            </div>

            <!-- Action Buttons: Register to Target Engineering List -->
            <div style="display:flex; gap:8px; padding-top:8px; border-top:1px solid #e2e8f0;">
                <button type="button" class="btn btn-primary btn-sm" style="flex:1; background:#2563eb; border:none; padding:8px 10px; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="registerCandidateAsTarget('${targetSymbol}', 'KO', '${safeNoteKO}')">
                    <i class="fa-solid fa-scissors"></i> 결손(KO) 타겟 리스트 등록
                </button>
                <button type="button" class="btn btn-primary btn-sm" style="flex:1; background:#ef4444; border:none; padding:8px 10px; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="registerCandidateAsTarget('${targetSymbol}', 'OE', '${safeNoteOE}')">
                    <i class="fa-solid fa-arrow-up"></i> 과발현(OE) 타겟 리스트 등록
                </button>
            </div>
        </div>
    `;
}

function renderCandidateResultsTable(data) {
    const tbody = document.getElementById("cand-results-tbody");
    const countBadge = document.getElementById("cand-result-count-badge");
    if (!tbody) return;

    const candidates = data.candidates || [];
    if (countBadge) countBadge.textContent = `${data.total_candidates || candidates.length}개`;

    const ctrlName = data.control_name || "WT";
    const treatName = data.treated_name || "Mutant";

    if (candidates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#64748b; padding:45px 0;">설정된 필터 조건에 부합하는 후보 유전자가 없습니다. [실험군 최소 발현량]이나 [On/Off 전환 필터] 조건을 완화해 보세요.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    candidates.forEach((cand, idx) => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        if (cand.is_de_novo_on) {
            tr.style.background = "rgba(254, 242, 242, 0.55)";
        }

        const targetSymbol = (cand.gene_symbol && !cand.gene_symbol.match(/^\d+$/)) ? cand.gene_symbol : cand.locus_tag;
        const symbolHtml = cand.is_unnamed_orf
            ? `<strong>${cand.locus_tag}</strong><br><span style="font-size:10px; color:#d97706; font-weight:600;">[미명명 ORF${cand.ncbi_id ? ` / NCBI:${cand.ncbi_id}` : ""}]</span>`
            : `<strong>${cand.gene_symbol}</strong> <code style="font-size:11px; color:#64748b;">(${cand.locus_tag})</code>`;

        let switchBadgeStyle = "background:#f1f5f9; color:#475569;";
        if (cand.switch_type === "ON_SWITCH") switchBadgeStyle = "background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:700;";
        else if (cand.switch_type === "OFF_SWITCH") switchBadgeStyle = "background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; font-weight:700;";
        else if (cand.switch_type === "HIGH_UP") switchBadgeStyle = "background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-weight:600;";

        const fcSign = cand.log2fc > 0 ? "+" : "";
        const fcClass = cand.log2fc >= 0 ? "up-text" : "down-text";

        const mfList = (cand.mol_functions || []).map(x => x.name).join(", ");
        const ecList = (cand.ec_numbers || []).length > 0 ? ` [EC ${cand.ec_numbers.join(", ")}]` : "";
        const bpList = (cand.bio_processes || []).slice(0, 2).map(x => x.name).join(", ");
        const funcDisplay = (mfList || bpList || cand.func_summary) + ecList;

        const safeNoteKO = `${treatName} 우회 효소 결실 후보 (${ctrlName}:${cand.wt_val}->${treatName}:${cand.mutant_val})`.replace(/'/g, "");
        const safeNoteOE = `${treatName} 과발현 후보 (${ctrlName}:${cand.wt_val}->${treatName}:${cand.mutant_val})`.replace(/'/g, "");

        tr.innerHTML = `
            <td style="text-align:center; font-weight:700; color:#334155;">#${idx + 1}</td>
            <td style="text-align:center;">
                <span style="background:${cand.candidate_score >= 70 ? '#4f46e5' : '#64748b'}; color:#ffffff; padding:2px 8px; border-radius:10px; font-weight:700; font-size:11px;">
                    ${cand.candidate_score}
                </span>
            </td>
            <td>${symbolHtml}</td>
            <td><span style="display:inline-block; padding:2px 7px; border-radius:6px; font-size:11px; ${switchBadgeStyle}">${cand.switch_label}</span></td>
            <td style="text-align:right;"><b>${cand.wt_val}</b> <span style="font-size:10px; color:#94a3b8;">(${cand.wt_pct}%)</span></td>
            <td style="text-align:right;"><b>${cand.mutant_val}</b> <span style="font-size:10px; color:#64748b;">(${cand.mut_pct}%)</span></td>
            <td style="text-align:right; font-weight:700;" class="${fcClass}">${fcSign}${cand.log2fc}</td>
            <td style="text-align:right; color:#64748b;">${cand.fdr !== null && cand.fdr !== undefined ? cand.fdr : "-"}</td>
            <td style="font-size:11px; color:#334155; line-height:1.4;">${funcDisplay}</td>
            <td style="text-align:center;" onclick="event.stopPropagation();">
                <div style="display:inline-flex; gap:4px;">
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:10px; font-weight:700; color:#1d4ed8; border-color:#bfdbfe; background:#eff6ff;" title="결손(KO) 타겟 리스트에 추가" onclick="registerCandidateAsTarget('${targetSymbol}', 'KO', '${safeNoteKO}')">+KO</button>
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:10px; font-weight:700; color:#b91c1c; border-color:#fecaca; background:#fef2f2;" title="과발현(OE) 타겟 리스트에 추가" onclick="registerCandidateAsTarget('${targetSymbol}', 'OE', '${safeNoteOE}')">+OE</button>
                </div>
            </td>
        `;

        tr.addEventListener("click", () => {
            renderCandidateDetailBox(cand, ctrlName, treatName);
        });

        tbody.appendChild(tr);
    });
}

function registerCandidateAsTarget(symbol, strategy, note) {
    // Ensure pathwayMapsStore[currentMapId] is initialized even if user hasn't opened the Custom Pathway tab yet
    if (!pathwayMapsStore || !pathwayMapsStore[currentMapId]) {
        const savedStore = localStorage.getItem("pathway_maps_store");
        if (savedStore) {
            try { pathwayMapsStore = JSON.parse(savedStore); } catch (e) {}
        }
        if (!pathwayMapsStore[currentMapId]) {
            pathwayMapsStore[currentMapId] = {
                name: "Yeast GSH Pathway (S. cerevisiae)",
                species: gCurrentSpecies || "sce",
                width: 1024,
                height: 580,
                nodes: [],
                arrows: []
            };
        }
    }
    addTargetGene(symbol, strategy, note);
}

function exportCandidateTargetsToCSV() {
    if (!gLastCandidateScanData || !gLastCandidateScanData.candidates || gLastCandidateScanData.candidates.length === 0) {
        showGshToast("먼저 타겟 후보 발굴을 실행해주세요.");
        return;
    }
    const ctrlName = gLastCandidateScanData.control_name || "WT";
    const treatName = gLastCandidateScanData.treated_name || "Mutant";
    const headers = ["Rank", "Score", "Locus_Tag", "Gene_Symbol", "NCBI_ID", "Switch_Type", `${ctrlName}_Expr`, `${ctrlName}_Pct`, `${treatName}_Expr`, `${treatName}_Pct`, "Log2FC", "FDR", "EC_Numbers", "Molecular_Functions", "Biological_Processes"];
    const rows = gLastCandidateScanData.candidates.map((c, idx) => [
        idx + 1,
        c.candidate_score,
        c.locus_tag,
        c.gene_symbol,
        c.ncbi_id || "",
        c.switch_type,
        c.wt_val,
        c.wt_pct,
        c.mutant_val,
        c.mut_pct,
        c.log2fc,
        c.fdr !== null && c.fdr !== undefined ? c.fdr : "",
        `"${(c.ec_numbers || []).join("; ")}"`,
        `"${(c.mol_functions || []).map(x => x.name).join("; ")}"`,
        `"${(c.bio_processes || []).map(x => x.name).join("; ")}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidate_target_genes_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Custom GSH Pathway Mapped Overlay & Interactive Editor Logic
// ----------------------------------------------------------------------
let pathwayMapsStore = {};
let currentMapId = "yeast_gsh_pathway";
let isGshEditMode = false;
let activeGshTool = null; // 'add-node', 'add-zone', 'add-arrow', 'add-gene', 'delete', null
let selectedArrowSourceId = null;
let showGshTargetBadges = localStorage.getItem("gsh_show_target_badges") !== "false"; // Global toggle for on-map OE/KO badges
let showGshFcValues = localStorage.getItem("gsh_show_fc_values") === "true"; // Toggle numeric Log2FC inside gene pill
let showGshZones = localStorage.getItem("gsh_show_zones") !== "false"; // Toggle Sub-pathway Zone background boxes
let enableGshSmartSnap = true; // Smart alignment guides & magnetic snap

// Global selection sets for advanced editor UX
let selectedNodes = new Set();
let selectedArrows = new Set();
let selectedGenes = new Set(); // Stores gene unique IDs (keys)
let selectedZones = new Set(); // Stores zone IDs
let clipboardBuffer = null; // Buffer containing deep copies of copied elements

function getGshGeneOffsets(mapId) {
    const map = pathwayMapsStore[mapId];
    if (!map) return {};
    if (!map.geneOffsets) {
        const local = localStorage.getItem(`gsh_gene_offsets_${mapId}`);
        map.geneOffsets = local ? JSON.parse(local) : {};
    }
    return map.geneOffsets;
}

function setGshGeneOffsets(mapId, val) {
    const map = pathwayMapsStore[mapId];
    if (map) {
        map.geneOffsets = val;
        localStorage.setItem(`gsh_gene_offsets_${mapId}`, JSON.stringify(val));
    }
}

function getGshCustomGenes(mapId) {
    const map = pathwayMapsStore[mapId];
    if (!map) return [];
    if (!map.customGenes) {
        const local = localStorage.getItem(`gsh_custom_genes_${mapId}`);
        map.customGenes = local ? JSON.parse(local) : [];
    }
    return map.customGenes;
}

function setGshCustomGenes(mapId, val) {
    const map = pathwayMapsStore[mapId];
    if (map) {
        map.customGenes = val;
        localStorage.setItem(`gsh_custom_genes_${mapId}`, JSON.stringify(val));
    }
}

function getGshDeletedDefaultGenes(mapId) {
    const map = pathwayMapsStore[mapId];
    if (!map) return [];
    if (!map.deletedDefaultGenes) {
        const local = localStorage.getItem(`gsh_deleted_default_genes_${mapId}`);
        map.deletedDefaultGenes = local ? JSON.parse(local) : [];
    }
    return map.deletedDefaultGenes;
}

function setGshDeletedDefaultGenes(mapId, val) {
    const map = pathwayMapsStore[mapId];
    if (map) {
        map.deletedDefaultGenes = val;
        localStorage.setItem(`gsh_deleted_default_genes_${mapId}`, JSON.stringify(val));
    }
}

function getGshTargetGenes(mapId) {
    const map = pathwayMapsStore[mapId];
    if (!map) return [];
    if (!map.targetGenes) {
        const local = localStorage.getItem(`gsh_target_genes_${mapId}`);
        map.targetGenes = local ? JSON.parse(local) : [];
    }
    return map.targetGenes;
}

function setGshTargetGenes(mapId, val) {
    const map = pathwayMapsStore[mapId];
    if (map) {
        map.targetGenes = val;
        localStorage.setItem(`gsh_target_genes_${mapId}`, JSON.stringify(val));
    }
}

function removeGshGeneData(mapId) {
    const map = pathwayMapsStore[mapId];
    if (map) {
        delete map.geneOffsets;
        delete map.customGenes;
        delete map.deletedDefaultGenes;
        delete map.targetGenes;
    }
    localStorage.removeItem(`gsh_gene_offsets_${mapId}`);
    localStorage.removeItem(`gsh_custom_genes_${mapId}`);
    localStorage.removeItem(`gsh_deleted_default_genes_${mapId}`);
    localStorage.removeItem(`gsh_target_genes_${mapId}`);
}

function clearSelection() {
    selectedNodes.clear();
    selectedArrows.clear();
    selectedGenes.clear();
    selectedZones.clear();
    const zonePosPanel = document.getElementById("zone-title-pos-panel");
    if (zonePosPanel) zonePosPanel.style.display = "none";
}

function saveAllPathwayMaps() {
    localStorage.setItem("pathway_maps_store", JSON.stringify(pathwayMapsStore));
    
    // Backup pathway maps to the server and return Promise
    return fetch(`${API_URL}/api/pathway_maps`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(pathwayMapsStore)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            console.error("Server pathway backup failed:", data.message);
        }
        return data;
    })
    .catch(err => {
        console.error("Error backing up pathways to server:", err);
        throw err;
    });
}

function loadGSHPathwayData() {
    updateStatus("analyzing", "대사 경로 데이터 매핑 중...");
    
    // Fetch server backup to restore GSH & NMN maps
    fetch(`${API_URL}/api/pathway_maps`)
    .then(res => {
        if (!res.ok) throw new Error("Server backup API error");
        return res.json();
    })
    .then(serverData => {
        if (serverData.success && serverData.store) {
            pathwayMapsStore = serverData.store;
            localStorage.setItem("pathway_maps_store", JSON.stringify(pathwayMapsStore));
            // Sync per-map local caches with authoritative server store
            Object.keys(pathwayMapsStore).forEach(mId => {
                const m = pathwayMapsStore[mId];
                if (m) {
                    if (m.geneOffsets) localStorage.setItem(`gsh_gene_offsets_${mId}`, JSON.stringify(m.geneOffsets));
                    if (m.customGenes) localStorage.setItem(`gsh_custom_genes_${mId}`, JSON.stringify(m.customGenes));
                    if (m.deletedDefaultGenes) localStorage.setItem(`gsh_deleted_default_genes_${mId}`, JSON.stringify(m.deletedDefaultGenes));
                    if (m.targetGenes) localStorage.setItem(`gsh_target_genes_${mId}`, JSON.stringify(m.targetGenes));
                }
            });
        } else {
            loadFromLocalStorage();
        }
        proceedWithLoading();
    })
    .catch(err => {
        console.warn("Failed to check server backup, using local fallback:", err);
        loadFromLocalStorage();
        proceedWithLoading();
    });

    function loadFromLocalStorage() {
        const savedStore = localStorage.getItem("pathway_maps_store");
        if (savedStore) {
            try {
                pathwayMapsStore = JSON.parse(savedStore);
            } catch (e) {
                console.error("Failed to parse saved pathway maps store:", e);
                pathwayMapsStore = {};
            }
        } else {
            pathwayMapsStore = {};
        }
    }

    function proceedWithLoading() {
        // Ensure default map exists in store
        if (!pathwayMapsStore["yeast_gsh_pathway"]) {
            fetchDefaultLayout()
            .then(defaultLayout => {
                pathwayMapsStore["yeast_gsh_pathway"] = {
                    name: "Yeast GSH Pathway (S. cerevisiae)",
                    species: "sce",
                    width: defaultLayout.width || 1880,
                    height: defaultLayout.height || 1150,
                    nodes: defaultLayout.nodes || [],
                    arrows: defaultLayout.arrows || [],
                    customGenes: defaultLayout.customGenes || [],
                    geneOffsets: defaultLayout.geneOffsets || {}
                };
                saveAllPathwayMaps();
                initializeMapDropdown();
                selectAndLoadMap(currentMapId);
            })
            .catch(err => {
                console.error("Failed to load default layout:", err);
                updateStatus("ready", "분석 완료");
            });
            return;
        }
        
        initializeMapDropdown();
        selectAndLoadMap(currentMapId);
    }
}

function fetchDefaultLayout() {
    return fetch(`/data/gsh_pathway_layout.json`)
    .then(res => {
        if (!res.ok) throw new Error("Default layout file not found.");
        return res.json();
    });
}

function initializeMapDropdown() {
    const selectEl = document.getElementById("pathway-map-select");
    if (!selectEl) return;
    
    selectEl.innerHTML = "";

    // Ensure default species preset maps exist
    if (!pathwayMapsStore["yeast_gsh_pathway"]) {
        pathwayMapsStore["yeast_gsh_pathway"] = {
            name: "Yeast GSH Pathway (S. cerevisiae)",
            species: "sce",
            width: 1024,
            height: 580,
            nodes: [],
            arrows: []
        };
    } else if (!pathwayMapsStore["yeast_gsh_pathway"].species) {
        pathwayMapsStore["yeast_gsh_pathway"].species = "sce";
    }

    if (!pathwayMapsStore["coryne_lysine_pathway"]) {
        pathwayMapsStore["coryne_lysine_pathway"] = {
            name: "L-Lysine Biosynthesis (C. glutamicum)",
            species: "cgl",
            width: 1024,
            height: 580,
            nodes: [
                { id: "node_1", x: 80, y: 150, w: 140, h: 50, label: "L-Aspartate", color: "blue" },
                { id: "node_2", x: 300, y: 150, w: 140, h: 50, label: "L-Aspartyl-P", color: "blue" },
                { id: "node_3", x: 520, y: 150, w: 140, h: 50, label: "ASA", color: "blue" },
                { id: "node_4", x: 740, y: 150, w: 140, h: 50, label: "L-Lysine", color: "green" }
            ],
            arrows: [
                { id: "arr_1", from: "node_1", to: "node_2", label: "lysC" },
                { id: "arr_2", from: "node_2", to: "node_3", label: "asd" },
                { id: "arr_3", from: "node_3", to: "node_4", label: "dapA/dapB" }
            ]
        };
    } else if (!pathwayMapsStore["coryne_lysine_pathway"].species) {
        pathwayMapsStore["coryne_lysine_pathway"].species = "cgl";
    }
    
    const curSpecies = gCurrentSpecies || "sce";
    const availableKeys = Object.keys(pathwayMapsStore).filter(mId => {
        const sp = pathwayMapsStore[mId].species || "sce";
        return sp === curSpecies;
    });

    if (!availableKeys.includes(currentMapId)) {
        currentMapId = availableKeys[0] || (curSpecies === "cgl" ? "coryne_lysine_pathway" : "yeast_gsh_pathway");
    }

    availableKeys.forEach(mapId => {
        const option = document.createElement("option");
        option.value = mapId;
        option.textContent = pathwayMapsStore[mapId].name;
        if (mapId === currentMapId) {
            option.selected = true;
        }
        selectEl.appendChild(option);
    });
}

function selectAndLoadMap(mapId) {
    if (!pathwayMapsStore[mapId]) {
        mapId = "yeast_gsh_pathway";
    }
    currentMapId = mapId;
    clearSelection();
    
    // Initialize history baseline for newly loaded map
    const initialSnap = captureGshSnapshot();
    if (initialSnap) {
        gshUndoStack = [initialSnap];
        gshRedoStack = [];
        updateGshUndoRedoButtons();
    }
    
    const currentMap = pathwayMapsStore[currentMapId];
    
    // Update Size input forms
    const widthInput = document.getElementById("canvas-width-input");
    const heightInput = document.getElementById("canvas-height-input");
    if (widthInput) widthInput.value = currentMap.width || 1024;
    if (heightInput) heightInput.value = currentMap.height || 580;
    
    // Resize SVG viewport dynamically
    const svgEl = document.getElementById("gsh-pathway-svg");
    if (svgEl) {
        svgEl.setAttribute("viewBox", `0 0 ${currentMap.width || 1024} ${currentMap.height || 580}`);
        const bgRect = svgEl.querySelector("rect");
        if (bgRect) {
            bgRect.setAttribute("width", currentMap.width || 1024);
            bgRect.setAttribute("height", currentMap.height || 580);
        }
    }
    
    // Load gene expression mapping
    const sidParam = gActiveSessionId ? `?session_id=${encodeURIComponent(gActiveSessionId)}` : '';
    fetch(`${API_URL}/api/gsh_pathway_data${sidParam}`)
    .then(response => {
        if (!response.ok) throw new Error("GSH pathway data fetch failed.");
        return response.json();
    })
    .then(data => {
        if (data.success) {
            window.lastGSHResults = data.results;
            renderGSHPathway();
            updateStatus("ready", "분석 완료");
        } else {
            window.lastGSHResults = {};
            renderGSHPathway();
            updateStatus("ready", "분석 완료");
        }
    })
    .catch(err => {
        console.error("Failed to load map data:", err);
        window.lastGSHResults = {};
        renderGSHPathway();
        updateStatus("ready", "분석 완료");
    });
}

// ----------------------------------------------------------------------
// Custom Pathway Editor Undo / Redo Manager
// ----------------------------------------------------------------------
let gshUndoStack = [];
let gshRedoStack = [];
const GSH_MAX_HISTORY = 50;

function captureGshSnapshot() {
    if (!currentMapId || !pathwayMapsStore[currentMapId]) return null;
    return {
        mapId: currentMapId,
        mapData: JSON.parse(JSON.stringify(pathwayMapsStore[currentMapId])),
        customGenes: JSON.parse(JSON.stringify(getGshCustomGenes(currentMapId))),
        geneOffsets: JSON.parse(JSON.stringify(getGshGeneOffsets(currentMapId))),
        deletedDefaults: JSON.parse(JSON.stringify(getGshDeletedDefaultGenes(currentMapId))),
        targetGenes: JSON.parse(JSON.stringify(getGshTargetGenes(currentMapId)))
    };
}

function pushGshHistory() {
    const snapshot = captureGshSnapshot();
    if (!snapshot) return;
    
    // Skip duplicate snapshot
    if (gshUndoStack.length > 0) {
        const top = gshUndoStack[gshUndoStack.length - 1];
        if (JSON.stringify(top) === JSON.stringify(snapshot)) {
            return;
        }
    }
    
    gshUndoStack.push(snapshot);
    if (gshUndoStack.length > GSH_MAX_HISTORY) {
        gshUndoStack.shift();
    }
    gshRedoStack = [];
    updateGshUndoRedoButtons();
}

function restoreGshSnapshot(snapshot) {
    if (!snapshot) return;
    const mapId = snapshot.mapId || currentMapId;
    currentMapId = mapId;
    pathwayMapsStore[mapId] = JSON.parse(JSON.stringify(snapshot.mapData));
    saveAllPathwayMaps();
    setGshCustomGenes(mapId, JSON.parse(JSON.stringify(snapshot.customGenes || [])));
    setGshGeneOffsets(mapId, JSON.parse(JSON.stringify(snapshot.geneOffsets || {})));
    setGshDeletedDefaultGenes(mapId, JSON.parse(JSON.stringify(snapshot.deletedDefaults || [])));
    setGshTargetGenes(mapId, JSON.parse(JSON.stringify(snapshot.targetGenes || [])));
    
    clearSelection();
    renderGSHPathway();
    renderTargetGeneList();
    updateGshUndoRedoButtons();
}

function undoGshState() {
    if (gshUndoStack.length <= 1) {
        showGshToast("더 이상 되돌릴 작업이 없습니다.");
        return;
    }
    const currentSnapshot = gshUndoStack.pop();
    gshRedoStack.push(currentSnapshot);
    
    const prevSnapshot = gshUndoStack[gshUndoStack.length - 1];
    restoreGshSnapshot(prevSnapshot);
    showGshToast("↩ 작업 되돌리기 완료 (Undo)");
}

function redoGshState() {
    if (gshRedoStack.length === 0) {
        showGshToast("다시 실행할 작업이 없습니다.");
        return;
    }
    const nextSnapshot = gshRedoStack.pop();
    gshUndoStack.push(nextSnapshot);
    restoreGshSnapshot(nextSnapshot);
    showGshToast("↪ 다시 실행 완료 (Redo)");
}

function updateGshUndoRedoButtons() {
    const btnUndo = document.getElementById("btn-gsh-undo");
    const btnRedo = document.getElementById("btn-gsh-redo");
    const canUndo = gshUndoStack.length > 1;
    const canRedo = gshRedoStack.length > 0;
    
    if (btnUndo) {
        btnUndo.disabled = !canUndo;
        btnUndo.style.opacity = canUndo ? "1" : "0.4";
        btnUndo.style.cursor = canUndo ? "pointer" : "not-allowed";
    }
    if (btnRedo) {
        btnRedo.disabled = !canRedo;
        btnRedo.style.opacity = canRedo ? "1" : "0.4";
        btnRedo.style.cursor = canRedo ? "pointer" : "not-allowed";
    }
}

function showGshToast(msg) {
    let toast = document.getElementById("gsh-toast-msg");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "gsh-toast-msg";
        toast.style.cssText = "position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.88); color: #ffffff; padding: 8px 18px; border-radius: 20px; font-size: 13px; font-weight: 500; z-index: 9999; backdrop-filter: blur(4px); box-shadow: 0 4px 14px rgba(0,0,0,0.2); transition: opacity 0.3s ease; pointer-events: none;";
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    clearTimeout(window._gshToastTimer);
    window._gshToastTimer = setTimeout(() => {
        toast.style.opacity = "0";
    }, 1500);
}

// ----------------------------------------------------------------------
// Target Gene Engineering Management (OE / KO)
// ----------------------------------------------------------------------
let currentTargetStrategy = 'OE';

function updateTargetBadgeToggleButton() {
    const btn = document.getElementById("btn-toggle-target-badges");
    if (!btn) return;
    if (showGshTargetBadges) {
        btn.innerHTML = `<i class="fa-solid fa-eye" style="color: #4f46e5;"></i><span>뱃지 표시</span>`;
        btn.style.background = "#eef2ff";
        btn.style.borderColor = "#c7d2fe";
        btn.style.color = "#4338ca";
        btn.title = "현재 맵 상에 조작 전략 배지(OE/KO)가 표시 중입니다. 클릭하면 숨깁니다.";
    } else {
        btn.innerHTML = `<i class="fa-solid fa-eye-slash" style="color: #94a3b8;"></i><span>뱃지 숨김</span>`;
        btn.style.background = "#f8fafc";
        btn.style.borderColor = "#cbd5e1";
        btn.style.color = "#94a3b8";
        btn.title = "현재 맵 상에 조작 전략 배지가 숨겨져 있습니다. 클릭하면 표시합니다.";
    }
}

function renderTargetGeneList() {
    updateTargetBadgeToggleButton();
    const listContainer = document.getElementById("target-genes-list-container");
    const statTotal = document.getElementById("target-stat-total");
    const statOe = document.getElementById("target-stat-oe");
    const statKo = document.getElementById("target-stat-ko");
    const datalist = document.getElementById("target-gene-datalist");
    
    if (!listContainer) return;
    
    const targets = getGshTargetGenes(currentMapId) || [];
    const oeCount = targets.filter(t => t.strategy === 'OE').length;
    const koCount = targets.filter(t => t.strategy === 'KO').length;
    
    if (statTotal) statTotal.textContent = `${targets.length}개`;
    if (statOe) statOe.textContent = `${oeCount}개`;
    if (statKo) statKo.textContent = `${koCount}개`;
    
    // Update gene datalist suggestions
    if (datalist) {
        datalist.innerHTML = "";
        const suggestedSymbols = new Set();
        
        if (window.gGenes && window.gGenes.length > 0) {
            window.gGenes.forEach(g => {
                if (g.gene_symbol) suggestedSymbols.add(g.gene_symbol.toUpperCase());
                if (g.locus_tag) suggestedSymbols.add(g.locus_tag.toUpperCase());
            });
        }
        
        const customGenes = getGshCustomGenes(currentMapId);
        customGenes.forEach(cg => {
            if (cg.symbol) suggestedSymbols.add(cg.symbol.toUpperCase());
        });
        if (window.lastGSHResults) {
            Object.keys(window.lastGSHResults).forEach(s => suggestedSymbols.add(s.toUpperCase()));
        }
        
        let count = 0;
        suggestedSymbols.forEach(sym => {
            if (count < 200) {
                const opt = document.createElement("option");
                opt.value = sym;
                datalist.appendChild(opt);
                count++;
            }
        });
    }
    
    if (targets.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: #94a3b8; padding: 32px 12px; font-size: 12px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
                <i class="fa-solid fa-bullseye" style="font-size: 26px; color: #cbd5e1; margin-bottom: 8px; display: block;"></i>
                등록된 타겟 유전자가 없습니다.<br>
                <span style="font-size: 11px; color: #64748b;">상단 입력창 또는 맵 위의 유전자를 통해 과발현(OE) / 결손(KO) 타겟을 추가하세요.</span>
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = "";
    targets.forEach((target) => {
        const geneInfo = lookupGeneInActiveSession(target.symbol);
        const resolvedLog2fc = geneInfo ? parseFloat(geneInfo.log2fc) : (target.log2fc !== undefined && target.log2fc !== null ? parseFloat(target.log2fc) : null);
        const resolvedPval = geneInfo ? parseFloat(geneInfo.p_value) : (target.pvalue !== undefined && target.pvalue !== null ? parseFloat(target.pvalue) : null);
        const locusTag = geneInfo ? geneInfo.locus_tag : (target.locus_tag || "");
        
        const isOE = target.strategy === "OE";
        const card = document.createElement("div");
        card.className = `target-gene-item ${isOE ? 'item-oe' : 'item-ko'}`;
        card.setAttribute("data-target-id", target.id);
        
        let fcBadgeHtml = "";
        if (resolvedLog2fc !== null && !isNaN(resolvedLog2fc)) {
            const fcColor = resolvedLog2fc > 0.5 ? '#ef4444' : (resolvedLog2fc < -0.5 ? '#3b82f6' : '#64748b');
            const sign = resolvedLog2fc > 0 ? '+' : '';
            fcBadgeHtml = `<span style="font-size: 11px; font-weight: 700; color: ${fcColor}; background: ${resolvedLog2fc > 0.5 ? '#fee2e2' : (resolvedLog2fc < -0.5 ? '#dbeafe' : '#f1f5f9')}; padding: 1px 6px; border-radius: 4px;">Log2FC: ${sign}${resolvedLog2fc.toFixed(2)}</span>`;
        } else {
            fcBadgeHtml = `<span style="font-size: 10px; color: #94a3b8; background: #f1f5f9; padding: 1px 5px; border-radius: 3px;">발현량 미확인</span>`;
        }
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="target-badge-pill ${isOE ? 'target-badge-pill-oe' : 'target-badge-pill-ko'}" onclick="toggleTargetStrategy('${target.id}')" title="클릭하여 전략 전환 (OE ↔ KO)">
                        ${isOE ? '<i class="fa-solid fa-arrow-up"></i> OE (과발현)' : '<i class="fa-solid fa-scissors"></i> KO (결손)'}
                    </span>
                    <strong style="font-size: 13px; color: #1e293b; font-family: 'Outfit', sans-serif;">${target.symbol}</strong>
                    ${locusTag ? `<span style="font-size: 10px; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 3px;">${locusTag}</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button class="btn btn-secondary btn-sm" onclick="focusGeneOnPathway('${target.symbol}')" title="대사 경로 맵에서 이 유전자 위치로 이동 및 강조" style="width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #4f46e5;">
                        <i class="fa-solid fa-magnifying-glass-location"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="removeTargetGene('${target.id}')" title="타겟 목록에서 제거" style="width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #ef4444;">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${fcBadgeHtml}
                    ${resolvedPval !== null && !isNaN(resolvedPval) ? `<span style="font-size: 10px; color: #94a3b8;">(p: ${resolvedPval.toExponential(2)})</span>` : ''}
                </div>
            </div>
            
            <div style="margin-top: 4px;">
                <input type="text" class="target-note-edit" placeholder="의도/노트 입력..." value="${target.note ? target.note.replace(/"/g, '&quot;') : ''}" onchange="updateTargetNote('${target.id}', this.value)" style="width: 100%; height: 22px; font-size: 10px; padding: 2px 6px; border: 1px solid #e2e8f0; border-radius: 4px; background: #f8fafc; color: #334155;">
            </div>
        `;
        
        listContainer.appendChild(card);
    });
}

function addTargetGene(symbol, strategy, note = "") {
    if (!symbol || !symbol.trim()) {
        showGshToast("유전자명을 입력해주세요.");
        return;
    }
    const cleanSymbol = symbol.trim().toUpperCase();
    const strat = (strategy || currentTargetStrategy || "OE").toUpperCase();
    
    const currentMap = pathwayMapsStore[currentMapId];
    if (!currentMap) return;
    
    let targets = getGshTargetGenes(currentMapId);
    
    const existing = targets.find(t => t.symbol.toUpperCase() === cleanSymbol);
    if (existing) {
        existing.strategy = strat;
        if (note) existing.note = note.trim();
        showGshToast(`'${cleanSymbol}' 타겟 전략이 ${strat}(으)로 갱신되었습니다.`);
    } else {
        const geneInfo = lookupGeneInActiveSession(cleanSymbol);
        const newTarget = {
            id: `tgt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            symbol: cleanSymbol,
            locus_tag: geneInfo ? geneInfo.locus_tag : "",
            strategy: strat,
            note: note ? note.trim() : "",
            log2fc: geneInfo ? geneInfo.log2fc : null,
            pvalue: geneInfo ? geneInfo.p_value : null,
            created_at: new Date().toISOString()
        };
        targets.push(newTarget);
        showGshToast(`'${cleanSymbol}' (${strat}) 타겟이 추가되었습니다.`);
    }
    
    setGshTargetGenes(currentMapId, targets);
    saveAllPathwayMaps();
    pushGshHistory();
    renderTargetGeneList();
    renderGSHPathway();
    
    const inputGene = document.getElementById("target-gene-input");
    const inputNote = document.getElementById("target-note-input");
    if (inputGene) inputGene.value = "";
    if (inputNote) inputNote.value = "";
}

function removeTargetGene(id) {
    let targets = getGshTargetGenes(currentMapId);
    targets = targets.filter(t => t.id !== id);
    setGshTargetGenes(currentMapId, targets);
    saveAllPathwayMaps();
    pushGshHistory();
    renderTargetGeneList();
    renderGSHPathway();
    showGshToast("타겟 유전자가 삭제되었습니다.");
}

function toggleTargetStrategy(id) {
    const targets = getGshTargetGenes(currentMapId);
    const item = targets.find(t => t.id === id);
    if (item) {
        item.strategy = item.strategy === "OE" ? "KO" : "OE";
        setGshTargetGenes(currentMapId, targets);
        saveAllPathwayMaps();
        pushGshHistory();
        renderTargetGeneList();
        renderGSHPathway();
        showGshToast(`'${item.symbol}' 전략이 ${item.strategy}(으)로 변경되었습니다.`);
    }
}

function updateTargetNote(id, note) {
    const targets = getGshTargetGenes(currentMapId);
    const item = targets.find(t => t.id === id);
    if (item) {
        item.note = note ? note.trim() : "";
        setGshTargetGenes(currentMapId, targets);
        saveAllPathwayMaps();
    }
}

window.quickAddTargetGene = function(symbol, strategy) {
    addTargetGene(symbol, strategy);
};

window.toggleTargetStrategy = toggleTargetStrategy;
window.removeTargetGene = removeTargetGene;
window.updateTargetNote = updateTargetNote;
window.focusGeneOnPathway = focusGeneOnPathway;

function focusGeneOnPathway(geneSymbol) {
    if (!geneSymbol) return;
    const clean = geneSymbol.trim().toUpperCase();
    
    const overlayContainer = document.getElementById("gsh-dynamic-overlay");
    if (!overlayContainer) return;
    
    const foElements = overlayContainer.querySelectorAll("foreignObject[data-gene]");
    let targetFo = null;
    let targetX = null;
    let targetY = null;
    
    foElements.forEach(fo => {
        const geneKey = fo.getAttribute("data-gene") || "";
        const geneText = fo.querySelector(".gsh-gene-text");
        const symbolText = geneText ? geneText.innerText.trim().toUpperCase() : "";
        if (geneKey.toUpperCase() === clean || symbolText === clean || geneKey.toUpperCase().includes(clean) || symbolText.includes(clean)) {
            targetFo = fo;
            targetX = parseFloat(fo.getAttribute("x")) + 30;
            targetY = parseFloat(fo.getAttribute("y")) + 10;
        }
    });
    
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    if (!wrapper) return;
    
    if (targetFo && targetX !== null && targetY !== null) {
        const rect = wrapper.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const targetScale = Math.max(1.3, gshZoomScale);
        gshZoomScale = targetScale;
        gshZoomPanX = centerX - targetX * targetScale;
        gshZoomPanY = centerY - targetY * targetScale;
        
        const vp = document.getElementById("gsh-pathway-viewport");
        if (vp) {
            vp.setAttribute("transform", `translate(${gshZoomPanX}, ${gshZoomPanY}) scale(${gshZoomScale})`);
        }
        
        const box = targetFo.querySelector(".gsh-gene-overlay-container");
        if (box) {
            box.classList.remove("gsh-target-focus-pulse");
            void box.offsetWidth;
            box.classList.add("gsh-target-focus-pulse");
            setTimeout(() => {
                box.classList.remove("gsh-target-focus-pulse");
            }, 3200);
        }
        showGshToast(`🔍 '${clean}' 유전자 위치로 이동했습니다.`);
    } else {
        showGshToast(`ℹ️ '${clean}' 유전자는 현재 맵 캔버스에 배치되어 있지 않은 타겟입니다. (편집 모드에서 유전자 추가 가능)`);
    }
}

function exportTargetGenesCSV() {
    const targets = getGshTargetGenes(currentMapId) || [];
    if (targets.length === 0) {
        alert("내보낼 타겟 유전자가 없습니다.");
        return;
    }
    
    const mapName = (pathwayMapsStore[currentMapId] && pathwayMapsStore[currentMapId].name) || "pathway";
    let csv = "Gene Symbol,Locus Tag,Strategy,Log2FC,P-Value,Design Note,Created At\n";
    
    targets.forEach(t => {
        const geneInfo = lookupGeneInActiveSession(t.symbol);
        const fc = geneInfo ? geneInfo.log2fc : (t.log2fc !== null && t.log2fc !== undefined ? t.log2fc : "");
        const pval = geneInfo ? geneInfo.p_value : (t.pvalue !== null && t.pvalue !== undefined ? t.pvalue : "");
        const locus = geneInfo ? geneInfo.locus_tag : (t.locus_tag || "");
        const noteEscaped = (t.note || "").replace(/"/g, '""');
        
        csv += `"${t.symbol}","${locus}","${t.strategy}","${fc}","${pval}","${noteEscaped}","${t.created_at || ""}"\n`;
    });
    
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `target_engineering_genes_${mapName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function copyTargetGenesToClipboard() {
    const targets = getGshTargetGenes(currentMapId) || [];
    if (targets.length === 0) {
        showGshToast("복사할 타겟 유전자가 없습니다.");
        return;
    }
    
    let text = "Gene\tLocus\tStrategy\tLog2FC\tNote\n";
    targets.forEach(t => {
        const geneInfo = lookupGeneInActiveSession(t.symbol);
        const fc = geneInfo ? geneInfo.log2fc : (t.log2fc !== null && t.log2fc !== undefined ? t.log2fc : "-");
        const locus = geneInfo ? geneInfo.locus_tag : (t.locus_tag || "-");
        text += `${t.symbol}\t${locus}\t${t.strategy}\t${fc}\t${t.note || ""}\n`;
    });
    
    navigator.clipboard.writeText(text).then(() => {
        showGshToast("📋 타겟 유전자 목록이 클립보드에 복사되었습니다!");
    }).catch(err => {
        console.error("Clipboard copy error:", err);
        showGshToast("클립보드 복사 실패");
    });
}

// Global reference mapping for fast lookup
function getNodesMap() {
    const map = {};
    const currentMap = pathwayMapsStore[currentMapId];
    if (currentMap && currentMap.nodes) {
        currentMap.nodes.forEach(n => {
            map[n.id] = n;
        });
    }
    return map;
}

// Calculate the optimized intersection path for arrows between nodes (Supports curves, straight lines, orthogonal/waypoints, and free anchors)
function calculateArrowPath(arrow, nodesMap) {
    const fromNode = arrow.from ? nodesMap[arrow.from] : null;
    const toNode = arrow.to ? nodesMap[arrow.to] : null;
    
    // Core points
    let p1 = fromNode ? { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 } : (arrow.fromCoords || { x: 100, y: 100 });
    let p2 = toNode ? { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 } : (arrow.toCoords || { x: 200, y: 200 });
    
    const hasWaypoints = Array.isArray(arrow.waypoints) && arrow.waypoints.length > 0;
    
    // 1. Multi-waypoint (bent / polyline) arrow path calculation
    if (hasWaypoints) {
        const rawPts = [p1, ...arrow.waypoints.map(w => ({ x: Number(w.x), y: Number(w.y) })), p2];
        
        // Adjust start point along the first segment (rawPts[0] -> rawPts[1])
        const fDx = rawPts[1].x - rawPts[0].x;
        const fDy = rawPts[1].y - rawPts[0].y;
        const fDist = Math.hypot(fDx, fDy) || 1;
        const fUx = fDx / fDist;
        const fUy = fDy / fDist;
        const startMargin = arrow.direction === 'both' ? 11 : (fromNode ? 2 : 0);
        const startX = fromNode ? p1.x + fUx * (fromNode.w / 2 + startMargin) : p1.x + fUx * startMargin;
        const startY = fromNode ? p1.y + fUy * (fromNode.h / 2 + startMargin) : p1.y + fUy * startMargin;
        
        // Adjust end point along the last segment (rawPts[n-2] -> rawPts[n-1])
        const lastPrev = rawPts[rawPts.length - 2];
        const lDx = p2.x - lastPrev.x;
        const lDy = p2.y - lastPrev.y;
        const lDist = Math.hypot(lDx, lDy) || 1;
        const lUx = lDx / lDist;
        const lUy = lDy / lDist;
        const endMargin = arrow.direction === 'none' ? 0 : 10;
        const endX = toNode ? p2.x - lUx * (toNode.w / 2 + endMargin) : p2.x - lUx * endMargin;
        const endY = toNode ? p2.y - lUy * (toNode.h / 2 + endMargin) : p2.y - lUy * endMargin;
        
        const pts = [{ x: startX, y: startY }, ...arrow.waypoints.map(w => ({ x: Number(w.x), y: Number(w.y) })), { x: endX, y: endY }];
        
        // Find midpoint of the longest segment for placing the "+유전자 / +꺾임" toolbar
        let bestLen = -1;
        let midX = (startX + endX) / 2;
        let midY = (startY + endY) / 2;
        for (let i = 0; i < pts.length - 1; i++) {
            const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            if (segLen > bestLen) {
                bestLen = segLen;
                midX = (pts[i].x + pts[i + 1].x) / 2;
                midY = (pts[i].y + pts[i + 1].y) / 2;
            }
        }
        
        arrow._calculated = { startX, startY, endX, endY, cx: midX, cy: midY, midX, midY, ux: lUx, uy: lUy, nx: -lUy, ny: lUx };
        
        // Build smooth rounded-corner polyline SVG path
        const cmds = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
        for (let i = 1; i < pts.length - 1; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const next = pts[i + 1];
            const v1x = curr.x - prev.x;
            const v1y = curr.y - prev.y;
            const v2x = next.x - curr.x;
            const v2y = next.y - curr.y;
            const len1 = Math.hypot(v1x, v1y);
            const len2 = Math.hypot(v2x, v2y);
            const r = Math.min(7, len1 / 3, len2 / 3);
            if (r > 1.2) {
                const pBeforeX = curr.x - (v1x / len1) * r;
                const pBeforeY = curr.y - (v1y / len1) * r;
                const pAfterX = curr.x + (v2x / len2) * r;
                const pAfterY = curr.y + (v2y / len2) * r;
                cmds.push(`L ${pBeforeX.toFixed(1)} ${pBeforeY.toFixed(1)}`);
                cmds.push(`Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${pAfterX.toFixed(1)} ${pAfterY.toFixed(1)}`);
            } else {
                cmds.push(`L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`);
            }
        }
        cmds.push(`L ${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`);
        return cmds.join(" ");
    }

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    
    const ux = dx / dist;
    const uy = dy / dist;
    
    // Normal vector for parallel offsets (transverse shift)
    const nx = -uy;
    const ny = ux;
    
    const pOffset = arrow.parallelOffset || 0;
    
    // Shift core points parallel to the path line to avoid layout overlapping
    p1 = { x: p1.x + nx * pOffset, y: p1.y + ny * pOffset };
    p2 = { x: p2.x + nx * pOffset, y: p2.y + ny * pOffset };
    
    // Auto-calculate border offset boundary with clear margins to avoid overlapping arrowheads
    let startMargin = fromNode ? 2 : 0;
    let endMargin = arrow.direction === 'none' ? 0 : 11;
    
    if (arrow.direction === 'both') {
        startMargin = 12;
        endMargin = 12;
    }
    
    let startX = fromNode ? p1.x + ux * (fromNode.w / 2 + startMargin) : p1.x + ux * startMargin;
    let startY = fromNode ? p1.y + uy * (fromNode.h / 2 + startMargin) : p1.y + uy * startMargin;
    
    const endX = toNode ? p2.x - ux * (toNode.w / 2 + endMargin) : p2.x - ux * endMargin;
    const endY = toNode ? p2.y - uy * (toNode.h / 2 + endMargin) : p2.y - uy * endMargin;
    
    let cx = (startX + endX) / 2;
    let cy = (startY + endY) / 2;
    let midX = cx;
    let midY = cy;

    // If orthogonal (90-degree elbow routing with rounded corners)
    if (arrow.type === 'orthogonal') {
        const adx = Math.abs(endX - startX);
        const ady = Math.abs(endY - startY);
        const r = Math.min(8, adx / 3, ady / 3);
        arrow._calculated = { startX, startY, endX, endY, cx, cy, midX, midY, ux, uy, nx, ny };
        if (adx < 2 || ady < 2) {
            return `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
        }
        // Single L-bend corner at (startX, p2.y) when vertical-first, keeping end arrowhead horizontal/vertical
        const cornerX = startX;
        const cornerY = p2.y;
        const endOrthX = toNode ? p2.x - Math.sign(p2.x - cornerX) * (toNode.w / 2 + endMargin) : p2.x - Math.sign(p2.x - cornerX) * endMargin;
        const sx = endOrthX > cornerX ? 1 : -1;
        const sy = cornerY > startY ? 1 : -1;
        arrow._calculated.midX = cornerX;
        arrow._calculated.midY = cornerY;
        return [
            `M ${startX.toFixed(1)} ${startY.toFixed(1)}`,
            `L ${cornerX.toFixed(1)} ${(cornerY - sy * r).toFixed(1)}`,
            `Q ${cornerX.toFixed(1)} ${cornerY.toFixed(1)} ${(cornerX + sx * r).toFixed(1)} ${cornerY.toFixed(1)}`,
            `L ${endOrthX.toFixed(1)} ${cornerY.toFixed(1)}`
        ].join(" ");
    }

    // If straight line
    if (arrow.type !== 'curved') {
        arrow._calculated = { startX, startY, endX, endY, cx, cy, midX, midY, ux, uy, nx, ny };
        return `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
    }
    
    // If curved (quadratic bezier Q path)
    const mx = (startX + endX) / 2;
    const my = (startY + endY) / 2;
    const curvx = -uy;
    const curvy = ux;
    const curvature = arrow.curvature !== undefined && arrow.curvature !== null ? arrow.curvature : 35;
    
    cx = mx + curvx * curvature;
    cy = my + curvy * curvature;
    
    // Exact midpoint of quadratic bezier curve at t=0.5: B(0.5) = (start + 2*ctrl + end) / 4
    midX = (startX + 2 * cx + endX) / 4;
    midY = (startY + 2 * cy + endY) / 4;
    
    arrow._calculated = { startX, startY, endX, endY, cx, cy, midX, midY, ux, uy, nx, ny, curvature };
    
    return `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
}

const ZONE_COLOR_THEMES = {
    blue:    { fill: "rgba(239, 246, 255, 0.52)", stroke: "#93c5fd", headerBg: "#dbeafe", text: "#1e40af" },
    emerald: { fill: "rgba(236, 253, 245, 0.52)", stroke: "#6ee7b7", headerBg: "#d1fae5", text: "#065f46" },
    green:   { fill: "rgba(236, 253, 245, 0.52)", stroke: "#6ee7b7", headerBg: "#d1fae5", text: "#065f46" },
    amber:   { fill: "rgba(255, 251, 235, 0.52)", stroke: "#fcd34d", headerBg: "#fef3c7", text: "#92400e" },
    yellow:  { fill: "rgba(255, 251, 235, 0.52)", stroke: "#fcd34d", headerBg: "#fef3c7", text: "#92400e" },
    violet:  { fill: "rgba(245, 243, 255, 0.52)", stroke: "#c4b5fd", headerBg: "#ede9fe", text: "#5b21b6" },
    purple:  { fill: "rgba(245, 243, 255, 0.52)", stroke: "#c4b5fd", headerBg: "#ede9fe", text: "#5b21b6" },
    cyan:    { fill: "rgba(236, 254, 255, 0.55)", stroke: "#67e8f9", headerBg: "#cffafe", text: "#155e75" },
    rose:    { fill: "rgba(255, 241, 242, 0.50)", stroke: "#fda4af", headerBg: "#ffe4e6", text: "#9f1239" },
    red:     { fill: "rgba(255, 241, 242, 0.50)", stroke: "#fda4af", headerBg: "#ffe4e6", text: "#9f1239" },
    gray:    { fill: "rgba(248, 250, 252, 0.65)", stroke: "#cbd5e1", headerBg: "#e2e8f0", text: "#334155" }
};

function clearSmartGuides() {
    const guidesLayer = document.getElementById("gsh-smart-guides");
    if (guidesLayer) guidesLayer.innerHTML = "";
}

function renderSmartGuides(guides) {
    const guidesLayer = document.getElementById("gsh-smart-guides");
    if (!guidesLayer) return;
    guidesLayer.innerHTML = "";
    guides.forEach(gd => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", gd.x1);
        line.setAttribute("y1", gd.y1);
        line.setAttribute("x2", gd.x2);
        line.setAttribute("y2", gd.y2);
        line.setAttribute("stroke", "#3b82f6");
        line.setAttribute("stroke-width", "1.2");
        line.setAttribute("stroke-dasharray", "4, 3");
        guidesLayer.appendChild(line);
    });
}

function computeNodeSmartSnap(draggedNode, rawX, rawY, currentMap) {
    if (!enableGshSmartSnap || !currentMap || !currentMap.nodes) {
        return { x: Math.round(rawX), y: Math.round(rawY), guides: [] };
    }
    const SNAP_TOL = 6;
    const w = draggedNode.w || 84;
    const h = draggedNode.h || 26;
    let cx = rawX + w / 2;
    let cy = rawY + h / 2;
    let snappedX = rawX;
    let snappedY = rawY;
    const guides = [];

    let bestDx = SNAP_TOL + 1;
    let bestMatchX = null;
    let bestDy = SNAP_TOL + 1;
    let bestMatchY = null;

    currentMap.nodes.forEach(other => {
        if (other.id === draggedNode.id || selectedNodes.has(other.id)) return;
        const ocx = other.x + (other.w || 84) / 2;
        const ocy = other.y + (other.h || 26) / 2;
        const dx = Math.abs(cx - ocx);
        if (dx <= SNAP_TOL && dx < bestDx) {
            bestDx = dx;
            bestMatchX = { ocx, ocy };
        }
        const dy = Math.abs(cy - ocy);
        if (dy <= SNAP_TOL && dy < bestDy) {
            bestDy = dy;
            bestMatchY = { ocx, ocy };
        }
    });

    if (bestMatchX) {
        snappedX = Math.round((bestMatchX.ocx - w / 2) * 10) / 10;
        cx = bestMatchX.ocx;
        guides.push({
            x1: bestMatchX.ocx,
            y1: Math.min(cy, bestMatchX.ocy) - 24,
            x2: bestMatchX.ocx,
            y2: Math.max(cy, bestMatchX.ocy) + 24
        });
    } else {
        snappedX = Math.round(rawX);
    }

    if (bestMatchY) {
        snappedY = Math.round((bestMatchY.ocy - h / 2) * 10) / 10;
        cy = bestMatchY.ocy;
        guides.push({
            x1: Math.min(cx, bestMatchY.ocx) - 36,
            y1: bestMatchY.ocy,
            x2: Math.max(cx, bestMatchY.ocx) + 36,
            y2: bestMatchY.ocy
        });
    } else {
        snappedY = Math.round(rawY);
    }

    return { x: snappedX, y: snappedY, guides };
}

function getZoneTitleCoordinates(zone, headerW, headerH = 22) {
    const pos = zone.titlePos || "top-left";
    let bx = zone.x + 14;
    let by = zone.y - 11;
    
    if (pos === "top-center") {
        bx = Math.round(zone.x + zone.w / 2 - headerW / 2);
        by = zone.y - 11;
    } else if (pos === "top-right") {
        bx = Math.round(zone.x + zone.w - headerW - 14);
        by = zone.y - 11;
    } else if (pos === "bottom-left") {
        bx = zone.x + 14;
        by = Math.round(zone.y + zone.h - 11);
    } else if (pos === "bottom-center") {
        bx = Math.round(zone.x + zone.w / 2 - headerW / 2);
        by = Math.round(zone.y + zone.h - 11);
    } else if (pos === "bottom-right") {
        bx = Math.round(zone.x + zone.w - headerW - 14);
        by = Math.round(zone.y + zone.h - 11);
    }
    
    const off = zone.titleOffset || { dx: 0, dy: 0 };
    return {
        x: Math.round(bx + (off.dx || 0)),
        y: Math.round(by + (off.dy || 0)),
        w: headerW,
        h: headerH
    };
}

function syncZonePosPanel(currentMap) {
    const zonePosPanel = document.getElementById("zone-title-pos-panel");
    const zonePosSelect = document.getElementById("zone-title-pos-select");
    if (!zonePosPanel) return;
    
    if (isGshEditMode && selectedZones.size > 0 && currentMap && currentMap.zones) {
        zonePosPanel.style.display = "inline-flex";
        if (selectedZones.size === 1 && zonePosSelect) {
            const curZid = Array.from(selectedZones)[0];
            const curZ = currentMap.zones.find(z => z.id === curZid);
            if (curZ) {
                zonePosSelect.value = curZ.titlePos || "top-left";
            }
        }
    } else {
        zonePosPanel.style.display = "none";
    }
}

function renderPathwayZones(currentMap, zonesLayer) {
    if (!zonesLayer) return;
    zonesLayer.innerHTML = "";
    if (!showGshZones || !currentMap.zones || !Array.isArray(currentMap.zones)) {
        syncZonePosPanel(currentMap);
        return;
    }

    currentMap.zones.forEach(zone => {
        const theme = ZONE_COLOR_THEMES[zone.color] || ZONE_COLOR_THEMES.blue;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        let zoneClass = "gsh-pathway-zone-group";
        if (selectedZones.has(zone.id)) {
            zoneClass += " element-selected";
        }
        g.setAttribute("class", zoneClass);
        g.setAttribute("data-zone-id", zone.id);

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("class", "zone-main-rect");
        rect.setAttribute("x", zone.x);
        rect.setAttribute("y", zone.y);
        rect.setAttribute("width", zone.w);
        rect.setAttribute("height", zone.h);
        rect.setAttribute("rx", "14");
        rect.setAttribute("fill", theme.fill);
        rect.setAttribute("stroke", theme.stroke);
        rect.setAttribute("stroke-width", "1.5");
        rect.setAttribute("stroke-dasharray", "6, 4");
        g.appendChild(rect);

        // Header label pill with flexible / draggable placement
        const labelText = zone.label || "Pathway Zone";
        const headerW = Math.max(90, Math.round(labelText.length * 6.6 + 22));
        const headerH = 22;
        const titleCoords = getZoneTitleCoordinates(zone, headerW, headerH);

        const pillGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        pillGroup.setAttribute("class", "gsh-zone-title-pill");
        pillGroup.setAttribute("data-zone-id", zone.id);
        pillGroup.style.cursor = isGshEditMode ? "grab" : "default";

        const headerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        headerRect.setAttribute("class", "gsh-zone-header-rect");
        headerRect.setAttribute("x", titleCoords.x);
        headerRect.setAttribute("y", titleCoords.y);
        headerRect.setAttribute("width", headerW);
        headerRect.setAttribute("height", headerH);
        headerRect.setAttribute("rx", "6");
        headerRect.setAttribute("fill", theme.headerBg);
        headerRect.setAttribute("stroke", theme.stroke);
        headerRect.setAttribute("stroke-width", "1.2");
        headerRect.setAttribute("style", "filter: drop-shadow(0 1px 2px rgba(0,0,0,0.06)); pointer-events: auto;");
        pillGroup.appendChild(headerRect);

        const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
        titleEl.setAttribute("class", "gsh-zone-header-text");
        titleEl.setAttribute("x", titleCoords.x + 10);
        titleEl.setAttribute("y", titleCoords.y + 15);
        titleEl.setAttribute("font-size", "11");
        titleEl.setAttribute("font-weight", "700");
        titleEl.setAttribute("fill", theme.text);
        titleEl.setAttribute("text-anchor", "start");
        titleEl.setAttribute("style", "pointer-events: none; user-select: none;");
        titleEl.textContent = labelText;
        pillGroup.appendChild(titleEl);

        // Quick Position Cycle button badge when zone is selected
        let posBadge = null;
        if (isGshEditMode && selectedZones.has(zone.id)) {
            posBadge = document.createElementNS("http://www.w3.org/2000/svg", "g");
            posBadge.setAttribute("class", "gsh-zone-pos-badge");
            posBadge.setAttribute("transform", `translate(${titleCoords.x + headerW + 4}, ${titleCoords.y + 1})`);
            posBadge.setAttribute("style", "cursor: pointer; pointer-events: auto;");
            posBadge.setAttribute("title", "클릭하여 제목 위치 전환 (좌상 ➔ 상중 ➔ 우상 ➔ 우하 ➔ 하중 ➔ 좌하)");

            const badgeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            badgeRect.setAttribute("x", "0");
            badgeRect.setAttribute("y", "0");
            badgeRect.setAttribute("width", "52");
            badgeRect.setAttribute("height", "20");
            badgeRect.setAttribute("rx", "4");
            badgeRect.setAttribute("fill", "#ffffff");
            badgeRect.setAttribute("stroke", "#3b82f6");
            badgeRect.setAttribute("stroke-width", "1");
            posBadge.appendChild(badgeRect);

            const badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            badgeText.setAttribute("x", "26");
            badgeText.setAttribute("y", "13");
            badgeText.setAttribute("font-size", "9.5");
            badgeText.setAttribute("font-weight", "700");
            badgeText.setAttribute("fill", "#2563eb");
            badgeText.setAttribute("text-anchor", "middle");
            badgeText.textContent = "⇄ 위치";
            posBadge.appendChild(badgeText);

            posBadge.addEventListener("click", (e) => {
                e.stopPropagation();
                const presets = ["top-left", "top-center", "top-right", "bottom-right", "bottom-center", "bottom-left"];
                const curIdx = presets.indexOf(zone.titlePos || "top-left");
                const nextPos = presets[(curIdx + 1) % presets.length];
                zone.titlePos = nextPos;
                delete zone.titleOffset; // Reset custom drag offset so it snaps cleanly to preset
                saveAllPathwayMaps();
                pushGshHistory();
                renderGSHPathway();
                const posNames = {
                    "top-left": "좌측 상단",
                    "top-center": "상단 중앙",
                    "top-right": "우측 상단",
                    "bottom-right": "우측 하단",
                    "bottom-center": "하단 중앙",
                    "bottom-left": "좌측 하단"
                };
                showGshToast(`📍 구역 제목 위치: ${posNames[nextPos]}`);
            });
            pillGroup.appendChild(posBadge);
        }

        g.appendChild(pillGroup);

        if (isGshEditMode) {
            // Drag title pill directly to custom coordinate offset
            pillGroup.addEventListener("mousedown", (e) => {
                if (activeGshTool === 'add-arrow' || activeGshTool === 'add-node' || activeGshTool === 'add-zone' || activeGshTool === 'delete') return;
                e.stopPropagation();
                if (e.button !== 0) return;

                if (!selectedZones.has(zone.id)) {
                    if (!e.ctrlKey && !e.shiftKey) clearSelection();
                    selectedZones.add(zone.id);
                    renderGSHPathway();
                }

                let isDraggingTitle = true;
                pillGroup.style.cursor = "grabbing";
                const startMouseX = e.clientX;
                const startMouseY = e.clientY;
                const initOff = zone.titleOffset || { dx: 0, dy: 0 };

                const onTitleMove = (mv) => {
                    if (!isDraggingTitle) return;
                    const dx = (mv.clientX - startMouseX) / gshZoomScale;
                    const dy = (mv.clientY - startMouseY) / gshZoomScale;
                    zone.titleOffset = {
                        dx: Math.round(initOff.dx + dx),
                        dy: Math.round(initOff.dy + dy)
                    };
                    const curCoords = getZoneTitleCoordinates(zone, headerW, headerH);
                    headerRect.setAttribute("x", curCoords.x);
                    headerRect.setAttribute("y", curCoords.y);
                    titleEl.setAttribute("x", curCoords.x + 10);
                    titleEl.setAttribute("y", curCoords.y + 15);
                    if (posBadge) {
                        posBadge.setAttribute("transform", `translate(${curCoords.x + headerW + 4}, ${curCoords.y + 1})`);
                    }
                };

                const onTitleUp = () => {
                    if (isDraggingTitle) {
                        isDraggingTitle = false;
                        pillGroup.style.cursor = "grab";
                        document.removeEventListener("mousemove", onTitleMove);
                        document.removeEventListener("mouseup", onTitleUp);
                        saveAllPathwayMaps();
                        pushGshHistory();
                        renderGSHPathway();
                    }
                };

                document.addEventListener("mousemove", onTitleMove);
                document.addEventListener("mouseup", onTitleUp);
            });

            // Double click on title pill to rename
            pillGroup.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                const newTitle = prompt("대사 구역(Zone) 제목을 입력하세요:", zone.label);
                if (newTitle !== null && newTitle.trim() !== "") {
                    zone.label = newTitle.trim();
                    saveAllPathwayMaps();
                    pushGshHistory();
                    renderGSHPathway();
                }
            });

            // Drag zone box
            g.addEventListener("mousedown", (e) => {
                if (activeGshTool === 'add-arrow' || activeGshTool === 'add-node' || activeGshTool === 'add-zone') return;
                e.stopPropagation();
                if (e.button !== 0) return;

                if (activeGshTool === 'delete') {
                    if (confirm(`대사 구역 '${zone.label}' 박스를 삭제하시겠습니까?`)) {
                        currentMap.zones = currentMap.zones.filter(z => z.id !== zone.id);
                        selectedZones.delete(zone.id);
                        saveAllPathwayMaps();
                        pushGshHistory();
                        renderGSHPathway();
                    }
                    return;
                }

                if (!activeGshTool) {
                    if (e.ctrlKey || e.shiftKey) {
                        if (selectedZones.has(zone.id)) selectedZones.delete(zone.id);
                        else selectedZones.add(zone.id);
                    } else {
                        clearSelection();
                        selectedZones.add(zone.id);
                    }
                    renderGSHPathway();
                }

                // Drag entire zone box position
                let isDraggingZone = true;
                const startX = e.clientX;
                const startY = e.clientY;
                const initZoneX = zone.x;
                const initZoneY = zone.y;

                const onZoneMove = (mv) => {
                    if (!isDraggingZone) return;
                    const dx = (mv.clientX - startX) / gshZoomScale;
                    const dy = (mv.clientY - startY) / gshZoomScale;
                    zone.x = Math.round(initZoneX + dx);
                    zone.y = Math.round(initZoneY + dy);
                    renderGSHPathway();
                };

                const onZoneUp = () => {
                    if (isDraggingZone) {
                        isDraggingZone = false;
                        document.removeEventListener("mousemove", onZoneMove);
                        document.removeEventListener("mouseup", onZoneUp);
                        saveAllPathwayMaps();
                        pushGshHistory();
                    }
                };

                document.addEventListener("mousemove", onZoneMove);
                document.addEventListener("mouseup", onZoneUp);
            });

            g.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                const newTitle = prompt("대사 구역(Zone) 제목을 입력하세요:", zone.label);
                if (newTitle !== null && newTitle.trim() !== "") {
                    zone.label = newTitle.trim();
                    saveAllPathwayMaps();
                    pushGshHistory();
                    renderGSHPathway();
                }
            });

            // Resize handle at bottom-right when zone is selected
            if (selectedZones.has(zone.id)) {
                const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                handle.setAttribute("cx", zone.x + zone.w);
                handle.setAttribute("cy", zone.y + zone.h);
                handle.setAttribute("r", "6.5");
                handle.setAttribute("class", "gsh-zone-resize-handle");
                handle.setAttribute("title", "드래그하여 구역 박스 크기 조절");

                handle.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (e.button !== 0) return;

                    let isResizing = true;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const initW = zone.w;
                    const initH = zone.h;

                    const onResizeMove = (mv) => {
                        if (!isResizing) return;
                        const dx = (mv.clientX - startX) / gshZoomScale;
                        const dy = (mv.clientY - startY) / gshZoomScale;
                        zone.w = Math.max(80, Math.round(initW + dx));
                        zone.h = Math.max(50, Math.round(initH + dy));
                        renderGSHPathway();
                    };

                    const onResizeUp = () => {
                        if (isResizing) {
                            isResizing = false;
                            document.removeEventListener("mousemove", onResizeMove);
                            document.removeEventListener("mouseup", onResizeUp);
                            saveAllPathwayMaps();
                            pushGshHistory();
                        }
                    };

                    document.addEventListener("mousemove", onResizeMove);
                    document.addEventListener("mouseup", onResizeUp);
                });

                g.appendChild(handle);
            }
        }

        zonesLayer.appendChild(g);
    });

    syncZonePosPanel(currentMap);
}

// Comprehensive rendering function for both background template (zones/nodes/arrows) and DEG overlay
function renderGSHPathway() {
    const zonesLayer = document.getElementById("gsh-pathway-zones");
    const nodesLayer = document.getElementById("gsh-pathway-nodes");
    const arrowsLayer = document.getElementById("gsh-pathway-arrows");
    const overlayLayer = document.getElementById("gsh-dynamic-overlay");
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    
    if (!nodesLayer || !arrowsLayer || !overlayLayer) return;
    
    // Clear previous
    if (zonesLayer) zonesLayer.innerHTML = "";
    nodesLayer.innerHTML = "";
    arrowsLayer.innerHTML = "";
    overlayLayer.innerHTML = "";
    
    // Toggle edit-mode body class
    if (isGshEditMode) {
        wrapper.classList.add("edit-mode-active");
    } else {
        wrapper.classList.remove("edit-mode-active");
    }
    
    const currentMap = pathwayMapsStore[currentMapId];
    if (!currentMap) return;

    // 0. Draw Sub-pathway Zones (Background Layer)
    renderPathwayZones(currentMap, zonesLayer);
    
    const nodesMap = getNodesMap();
    
    // 1. Draw Arrows (Reaction connections)
    if (currentMap.arrows) {
        // Group arrows by their node endpoints (sorted to detect bidirectional and multi-links)
        const arrowGroups = {};
        currentMap.arrows.forEach(arrow => {
            if (arrow.from && arrow.to) {
                const key = [arrow.from, arrow.to].sort().join("___");
                if (!arrowGroups[key]) arrowGroups[key] = [];
                arrowGroups[key].push(arrow);
            }
        });

        currentMap.arrows.forEach(arrow => {
            // Auto-curve or Auto-shift overlapping arrows between same nodes
            let originalType = arrow.type;
            let originalCurvature = arrow.curvature;
            let originalParallelOffset = arrow.parallelOffset;
            
            if (arrow.from && arrow.to) {
                const key = [arrow.from, arrow.to].sort().join("___");
                const group = arrowGroups[key];
                if (group && group.length > 1) {
                    const index = group.indexOf(arrow);
                    const sortedNodes = [arrow.from, arrow.to].sort();
                    const isForward = arrow.from === sortedNodes[0];
                    
                    if (arrow.type === 'curved') {
                        // 곡선인 경우 엇갈리게 휨 (Auto-curve)
                        if (group.length === 2) {
                            arrow.curvature = isForward ? 24 : -24;
                        } else {
                            const step = 22;
                            const offset = (index - (group.length - 1) / 2) * step;
                            arrow.curvature = offset === 0 ? 12 : offset;
                        }
                    } else {
                        // 직선인 경우 나란하게 평행 시프트 (Auto-shift)
                        if (group.length === 2) {
                            arrow.parallelOffset = isForward ? 7 : -7;
                        } else {
                            const step = 10;
                            const offset = (index - (group.length - 1) / 2) * step;
                            arrow.parallelOffset = offset === 0 ? 5 : offset;
                        }
                    }
                }
            }
            
            const pathStr = calculateArrowPath(arrow, nodesMap);
            
            // Restore original object properties clean
            arrow.type = originalType;
            arrow.curvature = originalCurvature;
            arrow.parallelOffset = originalParallelOffset;
            
            if (!pathStr) return;
            
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            
            // Apply selected class visually
            let arrowClass = "gsh-pathway-arrow-group";
            if (selectedArrows.has(arrow.id)) {
                arrowClass += " element-selected";
            }
            g.setAttribute("class", arrowClass);
            g.setAttribute("data-id", arrow.id);
            
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathStr);
            
            // Set markers based on arrow direction
            if (arrow.direction === 'both') {
                path.setAttribute("marker-start", "url(#arrowhead-start)");
                path.setAttribute("marker-end", "url(#arrowhead)");
            } else if (arrow.direction !== 'none') {
                path.setAttribute("marker-end", "url(#arrowhead)");
            }
            
            path.setAttribute("stroke", "#475569");
            path.setAttribute("stroke-width", "1.65");
            path.setAttribute("stroke-linejoin", "round");
            path.setAttribute("stroke-linecap", "round");
            if (arrow.dashed) {
                path.setAttribute("stroke-dasharray", "5, 4");
            }
            path.setAttribute("fill", "none");
            
            g.appendChild(path);
            
            // Edit mode listener for arrow
            if (isGshEditMode) {
                path.addEventListener("click", (e) => {
                    e.stopPropagation();
                    
                    if (activeGshTool === 'delete') {
                        if (confirm("이 반응 화살표를 삭제하시겠습니까?")) {
                            currentMap.arrows = currentMap.arrows.filter(a => a.id !== arrow.id);
                            selectedArrows.delete(arrow.id);
                            saveAllPathwayMaps();
                            pushGshHistory();
                            renderGSHPathway();
                        }
                    } else if (!activeGshTool) {
                        // Toggle Selection
                        if (e.ctrlKey || e.shiftKey) {
                            if (selectedArrows.has(arrow.id)) selectedArrows.delete(arrow.id);
                            else selectedArrows.add(arrow.id);
                        } else {
                            clearSelection();
                            selectedArrows.add(arrow.id);
                        }
                        renderGSHPathway();
                    }
                });

                // Double click arrow to open Gene Search Modal directly
                path.addEventListener("dblclick", (e) => {
                    e.stopPropagation();
                    openGeneSearchModal(arrow.id);
                });
            }
            
            // If arrow is selected and edit mode is active, render start & end anchor drag handles + waypoint handles
            if (isGshEditMode && selectedArrows.has(arrow.id)) {
                const fromNode = arrow.from ? nodesMap[arrow.from] : null;
                const toNode = arrow.to ? nodesMap[arrow.to] : null;
                const pStart = arrow.fromCoords || (fromNode ? { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 } : { x: 100, y: 100 });
                const pEnd = arrow.toCoords || (toNode ? { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 } : { x: 200, y: 200 });
                
                const createAnchor = (pt, type) => {
                    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    circle.setAttribute("cx", pt.x);
                    circle.setAttribute("cy", pt.y);
                    circle.setAttribute("r", "6");
                    circle.setAttribute("fill", type === 'start' ? "#3b82f6" : "#10b981");
                    circle.setAttribute("stroke", "#ffffff");
                    circle.setAttribute("stroke-width", "2");
                    circle.setAttribute("style", "cursor: pointer; pointer-events: auto;");
                    
                    circle.addEventListener("mousedown", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (e.button !== 0) return;
                        
                        let isDraggingAnchor = true;
                        const startMouseX = e.clientX;
                        const startMouseY = e.clientY;
                        const startPtX = pt.x;
                        const startPtY = pt.y;
                        
                        const handleAnchorMove = (mvEvent) => {
                            if (!isDraggingAnchor) return;
                            const dx = mvEvent.clientX - startMouseX;
                            const dy = mvEvent.clientY - startMouseY;
                            
                            // Correct dx/dy relative to zoom scale
                            const correctedDx = dx / gshZoomScale;
                            const correctedDy = dy / gshZoomScale;
                            
                            let newX = Math.round(startPtX + correctedDx);
                            let newY = Math.round(startPtY + correctedDy);
                            
                            // Snap to adjacent waypoint if present
                            if (enableGshSmartSnap && !mvEvent.altKey && Array.isArray(arrow.waypoints) && arrow.waypoints.length > 0) {
                                const adj = type === 'start' ? arrow.waypoints[0] : arrow.waypoints[arrow.waypoints.length - 1];
                                if (adj) {
                                    if (Math.abs(newX - adj.x) < 7) newX = adj.x;
                                    if (Math.abs(newY - adj.y) < 7) newY = adj.y;
                                }
                            }
                            
                            // Transform to absolute coordinate free arrow
                            arrow.from = null;
                            arrow.to = null;
                            
                            if (!arrow.fromCoords) arrow.fromCoords = { x: pStart.x, y: pStart.y };
                            if (!arrow.toCoords) arrow.toCoords = { x: pEnd.x, y: pEnd.y };
                            
                            if (type === 'start') {
                                arrow.fromCoords.x = newX;
                                arrow.fromCoords.y = newY;
                            } else {
                                arrow.toCoords.x = newX;
                                arrow.toCoords.y = newY;
                            }
                            
                            renderGSHPathway();
                        };
                        
                        const handleAnchorUp = () => {
                            isDraggingAnchor = false;
                            document.removeEventListener("mousemove", handleAnchorMove);
                            document.removeEventListener("mouseup", handleAnchorUp);
                            saveAllPathwayMaps();
                            pushGshHistory();
                        };
                        
                        document.addEventListener("mousemove", handleAnchorMove);
                        document.addEventListener("mouseup", handleAnchorUp);
                    });
                    
                    g.appendChild(circle);
                };
                
                createAnchor(pStart, 'start');
                createAnchor(pEnd, 'end');
                
                // Render draggable intermediate waypoint (corner) handles
                if (Array.isArray(arrow.waypoints) && arrow.waypoints.length > 0) {
                    arrow.waypoints.forEach((wp, wpIdx) => {
                        const wpCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                        wpCircle.setAttribute("cx", wp.x);
                        wpCircle.setAttribute("cy", wp.y);
                        wpCircle.setAttribute("r", "6");
                        wpCircle.setAttribute("fill", "#f59e0b");
                        wpCircle.setAttribute("stroke", "#ffffff");
                        wpCircle.setAttribute("stroke-width", "2");
                        wpCircle.setAttribute("style", "cursor: move; pointer-events: auto;");
                        wpCircle.setAttribute("title", "드래그하여 꺾임 위치 이동 / 우클릭 또는 Shift+클릭 시 꺾임점 삭제");
                        
                        wpCircle.addEventListener("mousedown", (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (e.button === 2 || e.shiftKey) {
                                arrow.waypoints.splice(wpIdx, 1);
                                saveAllPathwayMaps();
                                pushGshHistory();
                                renderGSHPathway();
                                showGshToast("꺾임점이 삭제되었습니다.");
                                return;
                            }
                            if (e.button !== 0) return;
                            
                            let isDraggingWp = true;
                            const startMouseX = e.clientX;
                            const startMouseY = e.clientY;
                            const startWpX = wp.x;
                            const startWpY = wp.y;
                            
                            const prevPt = wpIdx === 0 ? pStart : arrow.waypoints[wpIdx - 1];
                            const nextPt = wpIdx === arrow.waypoints.length - 1 ? pEnd : arrow.waypoints[wpIdx + 1];
                            
                            const handleWpMove = (mvEvent) => {
                                if (!isDraggingWp) return;
                                const dx = (mvEvent.clientX - startMouseX) / gshZoomScale;
                                const dy = (mvEvent.clientY - startMouseY) / gshZoomScale;
                                let nx = Math.round(startWpX + dx);
                                let ny = Math.round(startWpY + dy);
                                
                                if (enableGshSmartSnap && !mvEvent.altKey) {
                                    if (prevPt && Math.abs(nx - prevPt.x) < 7) nx = prevPt.x;
                                    else if (nextPt && Math.abs(nx - nextPt.x) < 7) nx = nextPt.x;
                                    if (prevPt && Math.abs(ny - prevPt.y) < 7) ny = prevPt.y;
                                    else if (nextPt && Math.abs(ny - nextPt.y) < 7) ny = nextPt.y;
                                }
                                
                                arrow.waypoints[wpIdx].x = nx;
                                arrow.waypoints[wpIdx].y = ny;
                                renderGSHPathway();
                            };
                            
                            const handleWpUp = () => {
                                isDraggingWp = false;
                                document.removeEventListener("mousemove", handleWpMove);
                                document.removeEventListener("mouseup", handleWpUp);
                                saveAllPathwayMaps();
                                pushGshHistory();
                            };
                            
                            document.addEventListener("mousemove", handleWpMove);
                            document.addEventListener("mouseup", handleWpUp);
                        });
                        
                        g.appendChild(wpCircle);
                    });
                }

                // Curved arrow interactive curvature control handle
                if (arrow.type === 'curved' && arrow._calculated) {
                    const ctrlPt = { x: arrow._calculated.cx, y: arrow._calculated.cy };
                    const curveCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    curveCircle.setAttribute("cx", ctrlPt.x);
                    curveCircle.setAttribute("cy", ctrlPt.y);
                    curveCircle.setAttribute("r", "6");
                    curveCircle.setAttribute("class", "arrow-curve-handle");
                    curveCircle.setAttribute("title", "드래그하여 화살표 곡률(휘어짐) 조절");
                    
                    curveCircle.addEventListener("mousedown", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (e.button !== 0) return;
                        
                        let isDraggingCurve = true;
                        const startMouseX = e.clientX;
                        const startMouseY = e.clientY;
                        const initialCurvature = arrow.curvature !== undefined && arrow.curvature !== null ? arrow.curvature : 35;
                        const calc = arrow._calculated;
                        
                        const handleCurveMove = (mvEvent) => {
                            if (!isDraggingCurve) return;
                            const dx = (mvEvent.clientX - startMouseX) / gshZoomScale;
                            const dy = (mvEvent.clientY - startMouseY) / gshZoomScale;
                            
                            // Project delta onto normal vector (nx, ny)
                            const deltaCurv = dx * calc.nx + dy * calc.ny;
                            arrow.curvature = Math.round(initialCurvature + deltaCurv);
                            renderGSHPathway();
                        };
                        
                        const handleCurveUp = () => {
                            isDraggingCurve = false;
                            document.removeEventListener("mousemove", handleCurveMove);
                            document.removeEventListener("mouseup", handleCurveUp);
                            saveAllPathwayMaps();
                            pushGshHistory();
                        };
                        
                        document.addEventListener("mousemove", handleCurveMove);
                        document.addEventListener("mouseup", handleCurveUp);
                    });
                    
                    g.appendChild(curveCircle);
                }

                // Quick "+유전자" and "+꺾임" badges on selected arrow
                if (arrow._calculated) {
                    const foBtn = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
                    foBtn.setAttribute("x", (arrow._calculated.midX - 66).toFixed(1));
                    foBtn.setAttribute("y", (arrow._calculated.midY - 28).toFixed(1));
                    foBtn.setAttribute("width", "140");
                    foBtn.setAttribute("height", "26");
                    foBtn.setAttribute("style", "overflow: visible; pointer-events: auto;");
                    
                    const btnDiv = document.createElement("div");
                    btnDiv.className = "arrow-gene-add-btn";
                    btnDiv.style.display = "inline-flex";
                    btnDiv.style.gap = "4px";
                    btnDiv.innerHTML = `
                        <button class="act-add-gene" style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; border: none; border-radius: 12px; font-size: 10px; font-weight: 700; padding: 2px 7px; cursor: pointer; display: flex; align-items: center; gap: 3px; box-shadow: 0 2px 5px rgba(236,72,153,0.4); white-space: nowrap;"><i class="fa-solid fa-plus"></i>유전자</button>
                        <button class="act-add-bend" title="화살표에 직각 꺾임점(Waypoint)을 추가합니다" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; font-size: 10px; font-weight: 700; padding: 2px 7px; cursor: pointer; display: flex; align-items: center; gap: 3px; box-shadow: 0 2px 5px rgba(245,158,11,0.4); white-space: nowrap;"><i class="fa-solid fa-turn-up"></i>+꺾임</button>
                    `;
                    btnDiv.querySelector(".act-add-gene").addEventListener("click", (e) => {
                        e.stopPropagation();
                        openGeneSearchModal(arrow.id);
                    });
                    btnDiv.querySelector(".act-add-bend").addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (!Array.isArray(arrow.waypoints)) arrow.waypoints = [];
                        if (arrow.waypoints.length === 0) {
                            // Create a clean orthogonal L-bend waypoint
                            arrow.waypoints.push({ x: Math.round(pStart.x), y: Math.round(pEnd.y) });
                        } else {
                            const lastWp = arrow.waypoints[arrow.waypoints.length - 1];
                            arrow.waypoints.push({
                                x: Math.round((lastWp.x + pEnd.x) / 2),
                                y: Math.round((lastWp.y + pEnd.y) / 2)
                            });
                        }
                        arrow.type = "orthogonal";
                        saveAllPathwayMaps();
                        pushGshHistory();
                        renderGSHPathway();
                        showGshToast("📐 주황색 꺾임 핸들을 드래그하여 원하는 경로로 조절하세요 (우클릭 시 꺾임 삭제).");
                    });
                    foBtn.appendChild(btnDiv);
                    g.appendChild(foBtn);
                }
            }
            
            arrowsLayer.appendChild(g);
        });
    }
    
    // 2. Draw Metabolite Nodes
    if (currentMap.nodes) {
        currentMap.nodes.forEach(node => {
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            
            // Selection highlights
            let nodeClass = "gsh-pathway-node-group";
            if (selectedNodes.has(node.id)) {
                nodeClass += " element-selected";
            }
            if (activeGshTool === 'add-arrow' && selectedArrowSourceId === node.id) {
                nodeClass += " node-connection-selected";
            }
            g.setAttribute("class", nodeClass);
            g.setAttribute("data-id", node.id);
            
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", node.x);
            rect.setAttribute("y", node.y);
            rect.setAttribute("width", node.w);
            rect.setAttribute("height", node.h);
            rect.setAttribute("rx", node.rx || 12);
            rect.setAttribute("stroke-width", "1");
            rect.setAttribute("filter", "url(#shadow)");
            
            // Custom node color override or default types styling
            if (node.fillColor) {
                rect.setAttribute("fill", node.fillColor);
                rect.setAttribute("stroke", node.strokeColor || "#64748b");
                rect.setAttribute("stroke-width", "1.5");
            } else if (node.type === 'accent') {
                rect.setAttribute("fill", "#f1f5f9");
                rect.setAttribute("stroke", "#94a3b8");
                rect.setAttribute("stroke-width", "1.5");
            } else if (node.type === 'gsh') {
                rect.setAttribute("fill", "#ecfdf5");
                rect.setAttribute("stroke", "#10b981");
                rect.setAttribute("stroke-width", "1.5");
            } else if (node.type === 'gssg') {
                rect.setAttribute("fill", "#f0fdfa");
                rect.setAttribute("stroke", "#14b8a6");
                rect.setAttribute("stroke-width", "1.5");
            } else {
                rect.setAttribute("fill", "#ffffff");
                rect.setAttribute("stroke", "#cbd5e1");
                rect.setAttribute("stroke-width", "1");
            }
            
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", node.x + node.w / 2);
            text.setAttribute("y", node.y + node.h / 2 + 4);
            text.setAttribute("font-size", (node.type === 'gsh' || node.type === 'gssg') ? '12' : '11.5');
            text.setAttribute("font-weight", (node.type === 'gsh' || node.type === 'gssg') ? '700' : '600');
            text.textContent = node.label;
            
            if (node.textColor) {
                text.setAttribute("fill", node.textColor);
            } else if (node.type === 'gsh') {
                text.setAttribute("fill", "#065f46");
            } else if (node.type === 'gssg') {
                text.setAttribute("fill", "#0f766e");
            } else {
                text.setAttribute("fill", "#334155");
            }
            
            g.appendChild(rect);
            g.appendChild(text);

            // 4 Anchor Ports for easy Drag-to-Connect (Edit mode)
            if (isGshEditMode) {
                const ports = [
                    { id: 'top', x: node.x + node.w / 2, y: node.y },
                    { id: 'right', x: node.x + node.w, y: node.y + node.h / 2 },
                    { id: 'bottom', x: node.x + node.w / 2, y: node.y + node.h },
                    { id: 'left', x: node.x, y: node.y + node.h / 2 }
                ];
                
                ports.forEach(pt => {
                    const portCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    portCircle.setAttribute("cx", pt.x);
                    portCircle.setAttribute("cy", pt.y);
                    portCircle.setAttribute("r", "4.5");
                    portCircle.setAttribute("class", `gsh-node-anchor-port port-${pt.id}`);
                    portCircle.setAttribute("title", "드래그하여 다른 노드로 화살표 연결 (Drag-to-Connect)");
                    
                    portCircle.addEventListener("mousedown", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (e.button !== 0) return;
                        startPortConnection(node.id, pt, e);
                    });
                    
                    g.appendChild(portCircle);
                });
            }
            
            // Edit Mode: Node Drag & Drop
            if (isGshEditMode) {
                let isDraggingNode = false;
                let startMux = 0;
                let startMuy = 0;
                
                g.addEventListener("mousedown", (e) => {
                    if (activeGshTool === 'add-arrow') return; // Let background canvas handle drag drawing!
                    
                    e.stopPropagation();
                    if (e.button !== 0) return; // Left click only
                    
                    // Click events mapping for tools
                    if (activeGshTool === 'delete') {
                        if (confirm(`대사산물 '${node.label}'만 삭제하시겠습니까? (연결된 화살표는 원래 자리에 보존됩니다)`)) {
                            // Backup coordinate pointers for any connected arrows before deleting this node
                            currentMap.arrows.forEach(arrow => {
                                if (arrow.from === node.id) {
                                    const pathStr = calculateArrowPath(arrow, nodesMap);
                                    const match = pathStr.match(/M\s+([\d.-]+)\s+([\d.-]+)/);
                                    if (match) {
                                        arrow.fromCoords = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
                                    }
                                    arrow.from = null;
                                }
                                if (arrow.to === node.id) {
                                    const pathStr = calculateArrowPath(arrow, nodesMap);
                                    arrow.toCoords = { x: node.x + node.w / 2, y: node.y + node.h / 2 };
                                    arrow.to = null;
                                }
                            });
                            
                            currentMap.nodes = currentMap.nodes.filter(n => n.id !== node.id);
                            selectedNodes.delete(node.id);
                            saveAllPathwayMaps();
                            pushGshHistory();
                            renderGSHPathway();
                        }
                        return;
                    }
                    
                    if (activeGshTool === 'add-arrow') {
                        if (!selectedArrowSourceId) {
                            selectedArrowSourceId = node.id;
                            renderGSHPathway();
                        } else if (selectedArrowSourceId === node.id) {
                            selectedArrowSourceId = null; // deselect
                            renderGSHPathway();
                        } else {
                            // Link Arrow from source to target
                            const selectedType = document.querySelector('input[name="arrow-type"]:checked')?.value || 'straight';
                            const selectedDir = document.querySelector('input[name="arrow-dir"]:checked')?.value || 'forward';
                            const isDashed = document.getElementById("arrow-dashed-check")?.checked || false;
                            
                            const newArrow = {
                                id: `arr_${selectedArrowSourceId}_${node.id}_${Date.now()}`,
                                from: selectedArrowSourceId,
                                to: node.id,
                                type: selectedType,
                                direction: selectedDir,
                                dashed: isDashed
                            };
                            currentMap.arrows.push(newArrow);
                            selectedArrowSourceId = null;
                            saveAllPathwayMaps();
                            pushGshHistory();
                            renderGSHPathway();
                        }
                        return;
                    }
                    
                    // Selection handling
                    if (!activeGshTool) {
                        if (e.ctrlKey || e.shiftKey) {
                            if (selectedNodes.has(node.id)) selectedNodes.delete(node.id);
                            else selectedNodes.add(node.id);
                        } else {
                            if (!selectedNodes.has(node.id)) {
                                clearSelection();
                                selectedNodes.add(node.id);
                            }
                        }
                        renderGSHPathway();
                    }
                    
                    // Default: Drag Node (Supports bulk dragging)
                    isDraggingNode = true;
                    startMux = e.clientX;
                    startMuy = e.clientY;
                    
                    // Capture start coordinates of all selected nodes for delta movement
                    const startCoords = {};
                    startCoords[node.id] = { x: node.x, y: node.y }; // Ensure current dragged node is always captured
                    selectedNodes.forEach(nid => {
                        const n = nodesMap[nid];
                        if (n) startCoords[nid] = { x: n.x, y: n.y };
                    });
                    
                    // Capture start offsets of all selected genes
                    const savedOffsets = getGshGeneOffsets(currentMapId);
                    const startOffsets = {};
                    selectedGenes.forEach(geneKey => {
                        startOffsets[geneKey] = JSON.parse(JSON.stringify(savedOffsets[geneKey] || { dx: 0, dy: 0 }));
                    });
                    
                    // Capture start coordinates of all selected arrows for delta movement
                    const startArrowCoords = {};
                    selectedArrows.forEach(aid => {
                        const arrow = currentMap.arrows.find(a => a.id === aid);
                        if (arrow) {
                            startArrowCoords[aid] = {
                                fromCoords: arrow.fromCoords ? { x: arrow.fromCoords.x, y: arrow.fromCoords.y } : null,
                                toCoords: arrow.toCoords ? { x: arrow.toCoords.x, y: arrow.toCoords.y } : null
                            };
                        }
                    });
                    
                    const handleMouseMove = (mvEvent) => {
                        if (!isDraggingNode) return;
                        
                        const deltaMux = mvEvent.clientX - startMux;
                        const deltaMuy = mvEvent.clientY - startMuy;
                        
                        const correctedDx = deltaMux / gshZoomScale;
                        const correctedDy = deltaMuy / gshZoomScale;
                        
                        // Bulk Move: if dragged node is part of selected nodes (size > 1), move all. Otherwise move single with Smart Snap.
                        if (selectedNodes.has(node.id) && (selectedNodes.size > 1 || selectedGenes.size > 0 || selectedArrows.size > 0)) {
                            clearSmartGuides();
                            selectedNodes.forEach(nid => {
                                const n = nodesMap[nid];
                                const sCoord = startCoords[nid];
                                if (n && sCoord) {
                                    n.x = Math.round((sCoord.x + correctedDx) * 10) / 10;
                                    n.y = Math.round((sCoord.y + correctedDy) * 10) / 10;
                                }
                            });
                            
                            // Also bulk move selected genes
                            selectedGenes.forEach(geneKey => {
                                const sOffset = startOffsets[geneKey];
                                if (sOffset) {
                                    savedOffsets[geneKey] = {
                                        dx: sOffset.dx + correctedDx,
                                        dy: sOffset.dy + correctedDy
                                    };
                                }
                            });
                            setGshGeneOffsets(currentMapId, savedOffsets);
                            
                            // Also bulk move selected arrows
                            selectedArrows.forEach(aid => {
                                const arrow = currentMap.arrows.find(a => a.id === aid);
                                const sArrowCoord = startArrowCoords[aid];
                                if (arrow && sArrowCoord) {
                                    if (arrow.fromCoords && sArrowCoord.fromCoords) {
                                        arrow.fromCoords.x = sArrowCoord.fromCoords.x + correctedDx;
                                        arrow.fromCoords.y = sArrowCoord.fromCoords.y + correctedDy;
                                    }
                                    if (arrow.toCoords && sArrowCoord.toCoords) {
                                        arrow.toCoords.x = sArrowCoord.toCoords.x + correctedDx;
                                        arrow.toCoords.y = sArrowCoord.toCoords.y + correctedDy;
                                    }
                                }
                            });
                        } else {
                            const sCoord = startCoords[node.id];
                            if (sCoord) {
                                const rawX = sCoord.x + correctedDx;
                                const rawY = sCoord.y + correctedDy;
                                if (!mvEvent.altKey) {
                                    const snapped = computeNodeSmartSnap(node, rawX, rawY, currentMap);
                                    node.x = snapped.x;
                                    node.y = snapped.y;
                                    renderGSHPathway();
                                    renderSmartGuides(snapped.guides);
                                    return;
                                } else {
                                    clearSmartGuides();
                                    node.x = Math.round(rawX * 10) / 10;
                                    node.y = Math.round(rawY * 10) / 10;
                                }
                            }
                        }
                        
                        // Redraw pathway dynamically to update arrow paths and overlays cleanly
                        renderGSHPathway();
                    };
                    
                    const handleMouseUp = () => {
                        if (isDraggingNode) {
                            isDraggingNode = false;
                            clearSmartGuides();
                            saveAllPathwayMaps();
                            pushGshHistory();
                            document.removeEventListener("mousemove", handleMouseMove);
                            document.removeEventListener("mouseup", handleMouseUp);
                            renderGSHPathway();
                        }
                    };
                    
                    document.addEventListener("mousemove", handleMouseMove);
                    document.addEventListener("mouseup", handleMouseUp);
                });
                
                // Double click to rename node name (auto-fits width to new label)
                g.addEventListener("dblclick", (e) => {
                    e.stopPropagation();
                    const newLabel = prompt("대사산물 이름을 수정하세요:", node.label);
                    if (newLabel !== null && newLabel.trim() !== "") {
                        const cleanLbl = newLabel.trim();
                        const oldCenterX = node.x + (node.w || 84) / 2;
                        node.label = cleanLbl;
                        const calcW = Math.max(84, Math.min(160, Math.round(cleanLbl.length * 6.8 + 16)));
                        node.w = calcW % 2 === 1 ? calcW + 1 : calcW;
                        node.x = Math.round((oldCenterX - node.w / 2) * 10) / 10;
                        saveAllPathwayMaps();
                        pushGshHistory();
                        renderGSHPathway();
                    }
                });
            }
            
            nodesLayer.appendChild(g);
        });
    }
    
    // 3. Draw DEG Gene Overlays (Original overlay layer)
    try {
        renderGSHPathwayOverlay(window.lastGSHResults || {});
    } catch (e) {
        console.error("Error rendering GSH Pathway Overlay:", e);
    }
    
    // 4. Render Target Gene Engineering sidebar
    try {
        renderTargetGeneList();
    } catch (e) {
        console.error("Error rendering Target Gene List:", e);
    }
}
 
// Gene Deletion Helper
function deleteGeneElement(key) {
    let custom = getGshCustomGenes(currentMapId);
    const originLen = custom.length;
    custom = custom.filter(cg => (cg.id ? cg.id !== key : cg.symbol !== key) && cg.symbol !== key);
    setGshCustomGenes(currentMapId, custom);
    
    const offsets = getGshGeneOffsets(currentMapId);
    delete offsets[key];
    setGshGeneOffsets(currentMapId, offsets);
    
    if (originLen === custom.length) {
        const deletedDefaults = getGshDeletedDefaultGenes(currentMapId);
        if (!deletedDefaults.includes(key)) {
            deletedDefaults.push(key);
        }
        setGshDeletedDefaultGenes(currentMapId, deletedDefaults);
    }
    
    selectedGenes.delete(key);
    saveAllPathwayMaps();
    pushGshHistory();
    renderGSHPathway();
}

function lookupGeneInActiveSession(querySymbol) {
    if (!querySymbol || !window.gGenes || window.gGenes.length === 0) return null;
    const clean = String(querySymbol).trim().toUpperCase();
    
    // 1. Direct match by symbol or locus tag
    for (const g of window.gGenes) {
        if ((g.gene_symbol && g.gene_symbol.toUpperCase() === clean) ||
            (g.locus_tag && g.locus_tag.toUpperCase() === clean)) {
            return {
                gene_symbol: g.gene_symbol || g.locus_tag,
                locus_tag: g.locus_tag,
                log2fc: parseFloat(g.log2fc) || 0.0,
                p_value: g.pvalue ?? g.fdr ?? 1.0,
                fdr: g.fdr ?? g.pvalue ?? 1.0,
                description: g.description || ""
            };
        }
    }
    
    // 2. Composite query (e.g. GSH1/GSH2 or GSH1,GSH2)
    if (clean.includes("/") || clean.includes(",")) {
        const parts = clean.split(/[\/,]+/).map(s => s.trim()).filter(Boolean);
        const matches = [];
        for (const p of parts) {
            const found = lookupGeneInActiveSession(p);
            if (found) matches.push(found);
        }
        if (matches.length > 0) {
            // Sort by highest absolute log2fc
            matches.sort((a, b) => Math.abs(b.log2fc) - Math.abs(a.log2fc));
            return matches[0];
        }
    }
    return null;
}
 
function renderGSHPathwayOverlay(results) {
    const overlayLayer = document.getElementById("gsh-dynamic-overlay");
    if (!overlayLayer) return;
    
    // Clear previous boxes
    overlayLayer.innerHTML = "";
    
    let tooltip = document.getElementById("gsh-custom-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "gsh-custom-tooltip";
        tooltip.className = "gsh-pathway-tooltip";
        tooltip.style.display = "none";
        document.body.appendChild(tooltip);
    }
    
    const currentMap = pathwayMapsStore[currentMapId];
    if (!currentMap) return;
    
    const mapWidth = currentMap.width || 1024;
    const mapHeight = currentMap.height || 580;
    
    // Convert to unified list of genes to render, resolving key collisions
    const genesToRender = [];
    const deletedDefaults = getGshDeletedDefaultGenes(currentMapId);
    const customGenes = getGshCustomGenes(currentMapId);
    const savedOffsets = getGshGeneOffsets(currentMapId);
    
    // 1. Add Default Genes if not deleted (Only for yeast_gsh_pathway default map)
    if (currentMapId === "yeast_gsh_pathway") {
        Object.keys(results).forEach(symbol => {
            if (!deletedDefaults.includes(symbol)) {
                const item = results[symbol];
                genesToRender.push({
                    id: symbol, // defaults can use symbol as ID
                    symbol: symbol,
                    x: item.x,
                    y: item.y,
                    rep_log2fc: item.rep_log2fc || 0.0,
                    genes: item.genes || [],
                    isCustom: false
                });
            }
        });
    }

    // 2. Add Custom Genes (Supports duplicates & key tracking)
    customGenes.forEach(cg => {
        const uniqueId = cg.id || `gene_legacy_${cg.symbol}_${Math.random()}`; // Handle old local storage models gracefully
        genesToRender.push({
            id: uniqueId,
            symbol: cg.symbol,
            x: cg.x,
            y: cg.y,
            arrowId: cg.arrowId || null,
            rep_log2fc: cg.rep_log2fc || 0.0,
            genes: cg.genes || [],
            isCustom: true
        });
    });
    
    genesToRender.forEach(item => {
        const key = item.id; // unique id to track movements & selections
        const symbol = item.symbol;
        
        // Dynamically resolve expression from active session genes first!
        const dynamicGene = lookupGeneInActiveSession(symbol);
        const resolvedLog2fc = dynamicGene ? dynamicGene.log2fc : (parseFloat(item.rep_log2fc) || 0.0);
        const resolvedGenes = dynamicGene ? [dynamicGene] : (item.genes && item.genes.length ? item.genes : []);
        
        // Convert coords based on dynamic map dimensions
        let baseX = (item.x * mapWidth) / 100;
        let baseY = (item.y * mapHeight) / 100;

        // If attached to an arrow, dynamically compute base position from arrow's calculated midpoint!
        if (item.arrowId && currentMap.arrows) {
            const attachedArrow = currentMap.arrows.find(a => a.id === item.arrowId);
            if (attachedArrow && attachedArrow._calculated) {
                baseX = attachedArrow._calculated.midX;
                baseY = attachedArrow._calculated.midY - 14;
            }
        }
        
        const offset = savedOffsets[key] || { dx: 0, dy: 0 };
        const finalX = baseX + offset.dx;
        const finalY = baseY + offset.dy;
        
        const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        fo.setAttribute("x", (finalX - 60).toFixed(1));
        fo.setAttribute("y", (finalY - 14).toFixed(1));
        fo.setAttribute("width", "150");
        fo.setAttribute("height", "32");
        fo.setAttribute("style", "overflow: visible; pointer-events: none;");
        fo.setAttribute("data-gene", key);
        
        const box = document.createElement("div");
        
        // Selected highlight style
        let boxClass = "gsh-gene-overlay-container";
        if (selectedGenes.has(key)) {
            boxClass += " element-selected";
        }
        box.className = boxClass;
        box.style.display = "inline-flex";
        box.style.alignItems = "center";
        box.style.gap = "4px";
        box.style.whiteSpace = "nowrap";
        box.style.cursor = isGshEditMode ? "move" : "default";
        box.style.userSelect = "none";
        box.style.pointerEvents = "auto";
        
        const geneText = document.createElement("span");
        geneText.className = "gsh-gene-text";
        geneText.innerText = symbol;
        
        if (symbol === "GEX1" || symbol === "OPT1") {
            geneText.classList.add("gsh-gene-text-black");
        }
        
        const indicator = document.createElement("div");
        indicator.className = "gsh-gene-indicator";
        
        const log2fc = resolvedLog2fc;
        const absFC = Math.abs(log2fc);
        
        if (log2fc > 0.5) {
            const alpha = Math.min(0.95, 0.45 + ((absFC - 0.5) / 2.0) * 0.5);
            indicator.style.backgroundColor = `rgba(239, 68, 68, ${alpha})`;
            indicator.style.borderColor = `rgba(220, 38, 38, ${Math.min(1.0, alpha + 0.15)})`;
            indicator.classList.add("gsh-gene-up-pulse");
            box.classList.add("gsh-pill-up");
        } else if (log2fc < -0.5) {
            const alpha = Math.min(0.95, 0.45 + ((absFC - 0.5) / 2.0) * 0.5);
            indicator.style.backgroundColor = `rgba(99, 102, 241, ${alpha})`;
            indicator.style.borderColor = `rgba(79, 70, 229, ${Math.min(1.0, alpha + 0.15)})`;
            indicator.classList.add("gsh-gene-down-pulse");
            box.classList.add("gsh-pill-down");
        } else {
            indicator.style.backgroundColor = `rgba(148, 163, 184, 0.25)`;
            indicator.style.borderColor = `rgba(148, 163, 184, 0.5)`;
        }
        
        // Attach resolved genes list to item for tooltip rendering
        item.genes = resolvedGenes;
        item.rep_log2fc = resolvedLog2fc;
        
        box.appendChild(geneText);
        box.appendChild(indicator);
        
        // Optional inline Log2FC numeric value inside capsule
        if (showGshFcValues && resolvedGenes && resolvedGenes.length > 0) {
            const fcBadge = document.createElement("span");
            let fcBadgeClass = "gsh-gene-fc-val ";
            if (log2fc > 0.5) fcBadgeClass += "fc-up";
            else if (log2fc < -0.5) fcBadgeClass += "fc-down";
            else fcBadgeClass += "fc-neutral";
            fcBadge.className = fcBadgeClass;
            fcBadge.innerText = `${log2fc >= 0 ? '+' : ''}${log2fc.toFixed(1)}`;
            box.appendChild(fcBadge);
        }
        
        // Target Gene Engineering on-map emblem badge
        const targetList = getGshTargetGenes(currentMapId) || [];
        const targetMatch = targetList.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
        if (showGshTargetBadges && targetMatch) {
            const tgtEmblem = document.createElement("span");
            const isOE = targetMatch.strategy === "OE";
            tgtEmblem.className = isOE ? "gsh-map-target-badge-oe" : "gsh-map-target-badge-ko";
            tgtEmblem.innerText = isOE ? "OE ↑" : "KO Δ";
            tgtEmblem.title = `대사공학 조작 타겟: ${isOE ? '과발현 (OE)' : '결손 (KO)'}${targetMatch.note ? ` - ${targetMatch.note}` : ''}`;
            box.appendChild(tgtEmblem);
            box.classList.add("gsh-gene-is-target");
        }
        
        fo.appendChild(box);

        // Edit Mode Specific Handlers: Delete Tool, Selection & Dragging, Rename
        if (isGshEditMode) {
            box.addEventListener("click", (e) => {
                e.stopPropagation();
                if (activeGshTool === 'delete') {
                    if (confirm(`유전자 배지 '${symbol}'을 삭제하시겠습니까?`)) {
                        deleteGeneElement(key);
                    }
                } else if (!activeGshTool) {
                    // Toggle Selection
                    if (e.ctrlKey || e.shiftKey) {
                        if (selectedGenes.has(key)) selectedGenes.delete(key);
                        else selectedGenes.add(key);
                    } else {
                        clearSelection();
                        selectedGenes.add(key);
                    }
                    renderGSHPathway();
                }
            });

            // Drag and Drop (Bulk Dragging + Smart Alignment Snap supported)
            let startMux = 0;
            let startMuy = 0;
            let isMoving = false;
            
            box.addEventListener("mousedown", (e) => {
                if (activeGshTool === 'add-arrow' || activeGshTool === 'add-zone') return; // Let background canvas handle drag drawing!
                
                e.stopPropagation();
                if (e.button !== 0) return;
                if (activeGshTool === 'delete') return; // let click handle delete
                
                // Selection handling
                if (!activeGshTool) {
                    if (e.ctrlKey || e.shiftKey) {
                        if (selectedGenes.has(key)) selectedGenes.delete(key);
                        else selectedGenes.add(key);
                    } else {
                        if (!selectedGenes.has(key)) {
                            clearSelection();
                            selectedGenes.add(key);
                        }
                    }
                    renderGSHPathway();
                }
                
                isMoving = true;
                startMux = e.clientX;
                startMuy = e.clientY;
                
                const savedOffsets = getGshGeneOffsets(currentMapId);
                startOffsets = {};
                
                if (selectedGenes.has(key)) {
                    selectedGenes.forEach(gKey => {
                        const curOffset = savedOffsets[gKey] || { dx: 0, dy: 0 };
                        startOffsets[gKey] = { dx: curOffset.dx, dy: curOffset.dy };
                    });
                } else {
                    const curOffset = savedOffsets[key] || { dx: 0, dy: 0 };
                    startOffsets[key] = { dx: curOffset.dx, dy: curOffset.dy };
                }
                
                const handleMouseMove = (mvEvent) => {
                    if (!isMoving) return;
                    
                    const deltaMux = mvEvent.clientX - startMux;
                    const deltaMuy = mvEvent.clientY - startMuy;
                    
                    const correctedDx = deltaMux / gshZoomScale;
                    const correctedDy = deltaMuy / gshZoomScale;
                    
                    const curSavedOffsets = getGshGeneOffsets(currentMapId);
                    
                    if (selectedGenes.has(key) && selectedGenes.size === 1) {
                        const initOff = startOffsets[key] || { dx: 0, dy: 0 };
                        let candX = baseX + initOff.dx + correctedDx;
                        let candY = baseY + initOff.dy + correctedDy;
                        const guides = [];
                        if (enableGshSmartSnap && !mvEvent.altKey) {
                            let bestDx = 6;
                            let bestDy = 6;
                            let snapX = null, snapY = null, gx1 = 0, gy1 = 0, gx2 = 0, gy2 = 0;
                            genesToRender.forEach(other => {
                                if (other.id === key) return;
                                const obX = (other.x * mapWidth) / 100 + ((curSavedOffsets[other.id] || {}).dx || 0);
                                const obY = (other.y * mapHeight) / 100 + ((curSavedOffsets[other.id] || {}).dy || 0);
                                if (Math.abs(candX - obX) < bestDx) {
                                    bestDx = Math.abs(candX - obX);
                                    snapX = obX;
                                    gy1 = Math.min(candY, obY) - 20;
                                    gy2 = Math.max(candY, obY) + 20;
                                }
                                if (Math.abs(candY - obY) < bestDy) {
                                    bestDy = Math.abs(candY - obY);
                                    snapY = obY;
                                    gx1 = Math.min(candX, obX) - 35;
                                    gx2 = Math.max(candX, obX) + 35;
                                }
                            });
                            if (snapX !== null) {
                                candX = snapX;
                                guides.push({ x1: snapX, y1: gy1, x2: snapX, y2: gy2 });
                            }
                            if (snapY !== null) {
                                candY = snapY;
                                guides.push({ x1: gx1, y1: snapY, x2: gx2, y2: snapY });
                            }
                        }
                        renderSmartGuides(guides);
                        curSavedOffsets[key] = {
                            dx: Math.round((candX - baseX) * 10) / 10,
                            dy: Math.round((candY - baseY) * 10) / 10
                        };
                        const foTarget = overlayLayer.querySelector(`foreignObject[data-gene="${key}"]`);
                        if (foTarget) {
                            foTarget.setAttribute("x", (baseX + curSavedOffsets[key].dx - 60).toFixed(1));
                            foTarget.setAttribute("y", (baseY + curSavedOffsets[key].dy - 14).toFixed(1));
                        }
                    } else if (selectedGenes.has(key)) {
                        clearSmartGuides();
                        selectedGenes.forEach(gKey => {
                            const initOff = startOffsets[gKey] || { dx: 0, dy: 0 };
                            curSavedOffsets[gKey] = {
                                dx: Math.round((initOff.dx + correctedDx) * 10) / 10,
                                dy: Math.round((initOff.dy + correctedDy) * 10) / 10
                            };
                            
                            const foTarget = overlayLayer.querySelector(`foreignObject[data-gene="${gKey}"]`);
                            if (foTarget) {
                                const gItem = customGenes.find(cg => (cg.id === gKey) || (!cg.id && cg.symbol === gKey)) || (window.lastGSHResults ? window.lastGSHResults[gKey] : null);
                                if (gItem) {
                                    const bX = (gItem.x * mapWidth) / 100;
                                    const bY = (gItem.y * mapHeight) / 100;
                                    foTarget.setAttribute("x", (bX + curSavedOffsets[gKey].dx - 60).toFixed(1));
                                    foTarget.setAttribute("y", (bY + curSavedOffsets[gKey].dy - 14).toFixed(1));
                                }
                            }
                        });
                    } else {
                        const initOff = startOffsets[key] || { dx: 0, dy: 0 };
                        curSavedOffsets[key] = {
                            dx: Math.round((initOff.dx + correctedDx) * 10) / 10,
                            dy: Math.round((initOff.dy + correctedDy) * 10) / 10
                        };
                        fo.setAttribute("x", (baseX + curSavedOffsets[key].dx - 60).toFixed(1));
                        fo.setAttribute("y", (baseY + curSavedOffsets[key].dy - 14).toFixed(1));
                    }
                    
                    setGshGeneOffsets(currentMapId, curSavedOffsets);
                };
                
                const handleMouseUp = () => {
                    if (isMoving) {
                        isMoving = false;
                        clearSmartGuides();
                        box.style.cursor = isGshEditMode ? "move" : "default";
                        
                        document.removeEventListener("mousemove", handleMouseMove);
                        document.removeEventListener("mouseup", handleMouseUp);
                        
                        saveAllPathwayMaps();
                        pushGshHistory();
                        renderGSHPathway();
                    }
                };
                
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
            });
            
            // Double click to rename custom gene
            box.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                const custom = getGshCustomGenes(currentMapId);
                const cg = custom.find(g => g.id === key);
                if (cg) {
                    const newSymbol = prompt("유전자 이름을 수정하세요:", cg.symbol);
                    if (newSymbol !== null && newSymbol.trim() !== "" && newSymbol.trim() !== cg.symbol) {
                        const cleanSymbol = newSymbol.trim().toUpperCase();
                        cg.symbol = cleanSymbol;
                        
                        // Update log2fc & isoforms for renamed symbol
                        let repLog2fc = 0.0;
                        let geneIsoforms = [];
                        if (gGenes && gGenes.length > 0) {
                            const match = gGenes.find(g => (g.gene_symbol && g.gene_symbol.toUpperCase() === cleanSymbol) || (g.locus_tag && g.locus_tag.toUpperCase() === cleanSymbol));
                            if (match) {
                                repLog2fc = parseFloat(match.log2fc) || 0.0;
                                geneIsoforms = [match];
                            }
                        }
                        cg.rep_log2fc = repLog2fc;
                        cg.genes = geneIsoforms;
                        
                        setGshCustomGenes(currentMapId, custom);
                        pushGshHistory();
                        loadGSHPathwayData();
                    }
                }
            });
        }
        
        // Tooltip bindings
        box.addEventListener("mouseenter", (e) => {
            if (isGshEditMode) return; // disable tooltip in edit mode for clarity
            
            let tooltipHtml = `<strong>${symbol}</strong> (Isoforms: ${item.genes ? item.genes.length : 0}개)<br/>`;
            tooltipHtml += `<div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">`;
            
            if (item.genes && item.genes.length > 0) {
                item.genes.forEach(g => {
                    const fcText = parseFloat(g.log2fc).toFixed(3);
                    const pValText = parseFloat(g.p_value).toExponential(3);
                    let fcColor = '#94a3b8';
                    if (g.log2fc > 0.5) fcColor = '#f87171';
                    else if (g.log2fc < -0.5) fcColor = '#818cf8';
                    
                    tooltipHtml += `<span style="font-weight:600; color:#e2e8f0;">${g.locus_tag}</span> (${g.gene_symbol || 'N/A'}): `;
                    tooltipHtml += `<span style="color:${fcColor}; font-weight:600;">${g.log2fc >= 0 ? '+' : ''}${fcText}</span> `;
                    tooltipHtml += `<span style="color:#a1a1aa; font-size:10px;">(p:${pValText})</span><br/>`;
                });
            } else {
                tooltipHtml += `<span style="color:#a1a1aa;">DEG 분석 데이터에 없는 수동 등록 유전자입니다.</span>`;
            }
            tooltipHtml += `</div>`;
            
            // Target gene info in tooltip
            const targetList = getGshTargetGenes(currentMapId) || [];
            const isTarget = targetList.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
            if (isTarget) {
                const isOE = isTarget.strategy === "OE";
                tooltipHtml += `
                    <div style="margin-top: 6px; padding: 4px 6px; background: rgba(0,0,0,0.3); border-radius: 4px; border-left: 3px solid ${isOE ? '#ef4444' : '#3b82f6'};">
                        <div style="color: ${isOE ? '#fca5a5' : '#93c5fd'}; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-bullseye"></i> 엔지니어링 타겟: ${isOE ? '과발현 (OE ↑)' : '결손 (KO Δ)'}
                        </div>
                        ${isTarget.note ? `<div style="color: #cbd5e1; font-size: 10px; margin-top: 2px;">메모: ${isTarget.note}</div>` : ''}
                    </div>
                `;
            }
            
            tooltip.innerHTML = tooltipHtml;
            tooltip.style.display = "block";
            
            const rect = indicator.getBoundingClientRect();
            tooltip.style.left = `${window.scrollX + rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
            tooltip.style.top = `${window.scrollY + rect.top - tooltip.offsetHeight - 8}px`;
        });
        
        box.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });
        
        overlayLayer.appendChild(fo);
    });
    
    // Filter out deleted default genes if any
    deletedDefaults.forEach(delKey => {
        const foEl = overlayLayer.querySelector(`foreignObject[data-gene="${delKey}"]`);
        if (foEl) foEl.remove();
    });
}

// ----------------------------------------------------------------------
// Custom Pathway Zoom & Pan Implementation
// ----------------------------------------------------------------------
let gshZoomScale = 1.0;
let gshZoomPanX = 0;
let gshZoomPanY = 0;
let gshIsDragging = false;
let gshStartX = 0;
let gshStartY = 0;
let gshSpacePressed = false;

// Global listeners to track Spacebar state
window.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT" || activeEl.isContentEditable);
    
    // F11: Pathway Fullscreen toggle when on custom pathway tab
    if (e.key === "F11" || e.code === "F11") {
        const customTab = document.getElementById("custom-pathway-tab");
        if ((customTab && customTab.classList.contains("active")) || (typeof isPathwayFullscreen === "function" && isPathwayFullscreen())) {
            e.preventDefault();
            togglePathwayFullscreen();
            return;
        }
    }

    // Escape: Exit pathway fullscreen mode
    if (e.key === "Escape" || e.code === "Escape") {
        if (typeof isPathwayFullscreen === "function" && isPathwayFullscreen()) {
            e.preventDefault();
            togglePathwayFullscreen(false);
            return;
        }
    }

    if (e.code === "Space" || e.key === " ") {
        if (isInput) return;
        gshSpacePressed = true;
        const wrapper = document.querySelector(".gsh-pathway-wrapper");
        if (wrapper && document.getElementById("custom-pathway-tab").classList.contains("active")) {
            e.preventDefault();
            wrapper.style.cursor = "grab";
        }
    }
    
    // Ctrl+Z (Undo) / Ctrl+Y or Ctrl+Shift+Z (Redo) for Custom Pathway Editor
    const customTab = document.getElementById("custom-pathway-tab");
    if (customTab && customTab.classList.contains("active") && isGshEditMode && !isInput) {
        const key = e.key ? e.key.toLowerCase() : '';
        if ((e.ctrlKey || e.metaKey) && key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redoGshState();
            } else {
                undoGshState();
            }
        } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
            e.preventDefault();
            redoGshState();
        }
    }
});

window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.key === " ") {
        gshSpacePressed = false;
        const wrapper = document.querySelector(".gsh-pathway-wrapper");
        if (wrapper && document.getElementById("custom-pathway-tab").classList.contains("active")) {
            wrapper.style.cursor = isGshEditMode ? "default" : "grab";
        }
    }
});

// Global Helper for Crisp SVG Mouse Coordinates Calculation
function getSvgCoords(clientX, clientY) {
    const svgEl = document.getElementById("gsh-pathway-svg");
    const viewport = document.getElementById("gsh-pathway-viewport");
    if (!svgEl || !viewport) return { x: 0, y: 0 };
    
    try {
        const pt = svgEl.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = viewport.getScreenCTM();
        if (ctm) {
            const svgPt = pt.matrixTransform(ctm.inverse());
            return { x: Math.round(svgPt.x), y: Math.round(svgPt.y) };
        }
    } catch (err) {
        console.warn("SVG CTM inverse error:", err);
    }
    
    const currentMap = pathwayMapsStore[currentMapId] || {};
    const mapWidth = currentMap.width || 1024;
    const mapHeight = currentMap.height || 580;
    const rect = svgEl.getBoundingClientRect();
    const unscaledX = ((clientX - rect.left) / (rect.width || 1)) * mapWidth;
    const unscaledY = ((clientY - rect.top) / (rect.height || 1)) * mapHeight;
    return {
        x: Math.round((unscaledX - gshZoomPanX) / gshZoomScale),
        y: Math.round((unscaledY - gshZoomPanY) / gshZoomScale)
    };
}

function initGSHZoomPan() {
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    const content = document.getElementById("gsh-pathway-content");
    if (!wrapper || !content) return;
    
    // Disable contextual menu on right click to allow smooth dragging without pops
    wrapper.addEventListener("contextmenu", (e) => {
        e.preventDefault();
    });
    
    // Zoom control buttons
    const btnIn = document.getElementById("btn-zoom-in");
    const btnOut = document.getElementById("btn-zoom-out");
    const btnReset = document.getElementById("btn-zoom-reset");
    const btnFs = document.getElementById("btn-pathway-fullscreen");
    const btnSync = document.getElementById("btn-refresh-gsh-pathway");
    
    if (btnIn) btnIn.addEventListener("click", () => adjustZoom(0.25));
    if (btnOut) btnOut.addEventListener("click", () => adjustZoom(-0.25));
    if (btnReset) btnReset.addEventListener("click", () => resetGSHZoom());
    if (btnFs) btnFs.addEventListener("click", () => togglePathwayFullscreen());

    // Double-click canvas background to toggle fullscreen mode
    wrapper.addEventListener("dblclick", (e) => {
        // Only toggle fullscreen if double-clicked on empty background
        const targetTag = e.target.tagName ? e.target.tagName.toLowerCase() : "";
        if (targetTag === "svg" || e.target.id === "gsh-pathway-content" || e.target.id === "gsh-pathway-viewport" || e.target.classList.contains("gsh-pathway-wrapper")) {
            togglePathwayFullscreen();
        }
    });
    if (btnSync) {
        btnSync.addEventListener("click", () => {
            if (confirm("현재 활성화된 대사 경로 레이아웃 및 커스텀 노드를 기본값으로 완전히 리셋하시겠습니까?")) {
                removeGshGeneData(currentMapId);
                
                // If resetting default map, clear map store entry to fetch raw default JSON
                if (currentMapId === "yeast_gsh_pathway") {
                    delete pathwayMapsStore["yeast_gsh_pathway"];
                    saveAllPathwayMaps();
                } else {
                    // For custom maps, just empty nodes and arrows
                    const currentMap = pathwayMapsStore[currentMapId];
                    if (currentMap) {
                        currentMap.nodes = [];
                        currentMap.arrows = [];
                        saveAllPathwayMaps();
                    }
                }
                
                // Clear active tool
                const toggleEdit = document.getElementById("toggle-edit-mode");
                if (toggleEdit) {
                    toggleEdit.checked = false;
                    isGshEditMode = false;
                    document.getElementById("gsh-editor-toolbar").style.display = "none";
                    setGshActiveTool(null);
                }
                
                clearSelection();
                loadGSHPathwayData();
                resetGSHZoom();
                alert("맵 레이아웃과 데이터가 초기값으로 완전히 리셋되었습니다.");
            }
        });
    }
    
    // Mouse Wheel Zoom
    wrapper.addEventListener("wheel", (e) => {
        if (document.getElementById("custom-pathway-tab").classList.contains("active")) {
            e.preventDefault();
            const zoomFactor = 0.08;
            const direction = e.deltaY < 0 ? 1 : -1;
            
            const rect = wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const contentX = (mouseX - gshZoomPanX) / gshZoomScale;
            const contentY = (mouseY - gshZoomPanY) / gshZoomScale;
            
            const newScale = Math.max(0.6, Math.min(3.5, gshZoomScale + direction * zoomFactor));
            
            gshZoomPanX = mouseX - contentX * newScale;
            gshZoomPanY = mouseY - contentY * newScale;
            gshZoomScale = newScale;
            
            applyTransform();
        }
    }, { passive: false });
    
    // Mouse Drag Pan / Marquee Selection Handler
    let isMarqueeSelecting = false;
    let marqueeStartX = 0;
    let marqueeStartY = 0;
    const marqueeEl = document.getElementById("selection-marquee");
    
    wrapper.addEventListener("mousedown", (e) => {
        // Check if we should pan:
        // We pan if: 1) edit mode is OFF, OR 2) Space key is pressed, OR 3) Right click (2) or Middle click (1) is used
        const shouldPan = !isGshEditMode || gshSpacePressed || e.button === 1 || e.button === 2;
        
        if (shouldPan) {
            if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input") || e.target.closest("select")) {
                return;
            }
            gshIsDragging = true;
            wrapper.style.cursor = "grabbing";
            gshStartX = e.clientX - gshZoomPanX;
            gshStartY = e.clientY - gshZoomPanY;
            e.preventDefault();
            return;
        }
        
        // Otherwise, perform Marquee Selection, Zone Drawing, or Arrow Drawing in Edit Mode
        if (isGshEditMode) {
            if (activeGshTool === 'add-zone') {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                
                const currentMap = pathwayMapsStore[currentMapId];
                if (!currentMap) return;
                if (!currentMap.zones) currentMap.zones = [];
                
                const startPt = getSvgCoords(e.clientX, e.clientY);
                const zonesLayer = document.getElementById("gsh-pathway-zones");
                const tempRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                tempRect.setAttribute("x", startPt.x);
                tempRect.setAttribute("y", startPt.y);
                tempRect.setAttribute("width", 0);
                tempRect.setAttribute("height", 0);
                tempRect.setAttribute("rx", 16);
                tempRect.setAttribute("fill", "rgba(59, 130, 246, 0.08)");
                tempRect.setAttribute("stroke", "#3b82f6");
                tempRect.setAttribute("stroke-width", "2");
                tempRect.setAttribute("stroke-dasharray", "6, 4");
                if (zonesLayer) zonesLayer.appendChild(tempRect);
                
                const handleZoneDrawMove = (mvEvent) => {
                    const curPt = getSvgCoords(mvEvent.clientX, mvEvent.clientY);
                    const zx = Math.min(startPt.x, curPt.x);
                    const zy = Math.min(startPt.y, curPt.y);
                    const zw = Math.abs(curPt.x - startPt.x);
                    const zh = Math.abs(curPt.y - startPt.y);
                    tempRect.setAttribute("x", zx);
                    tempRect.setAttribute("y", zy);
                    tempRect.setAttribute("width", zw);
                    tempRect.setAttribute("height", zh);
                };
                
                const handleZoneDrawUp = (muEvent) => {
                    document.removeEventListener("mousemove", handleZoneDrawMove);
                    document.removeEventListener("mouseup", handleZoneDrawUp);
                    tempRect.remove();
                    
                    const endPt = getSvgCoords(muEvent.clientX, muEvent.clientY);
                    const zx = Math.min(startPt.x, endPt.x);
                    const zy = Math.min(startPt.y, endPt.y);
                    const zw = Math.max(140, Math.abs(endPt.x - startPt.x));
                    const zh = Math.max(90, Math.abs(endPt.y - startPt.y));
                    
                    const label = prompt("대사 구역(Zone) 제목을 입력하세요 (예: Glycolysis, TCA Cycle):", "New Sub-pathway Zone");
                    if (label && label.trim() !== "") {
                        const paletteKeys = ["blue", "green", "yellow", "purple", "red", "gray"];
                        const pickedColor = paletteKeys[currentMap.zones.length % paletteKeys.length];
                        const newZoneId = `zone_${Date.now()}`;
                        currentMap.zones.push({
                            id: newZoneId,
                            label: label.trim(),
                            x: Math.round(zx),
                            y: Math.round(zy),
                            w: Math.round(zw),
                            h: Math.round(zh),
                            color: pickedColor
                        });
                        showGshZones = true;
                        clearSelection();
                        selectedZones.add(newZoneId);
                        setGshActiveTool(null);
                        saveAllPathwayMaps();
                        pushGshHistory();
                        renderGSHPathway();
                        showGshToast(`🗂️ '${label.trim()}' 대사 구역 박스가 생성되었습니다. 하단 색상 버튼으로 색상을 변경할 수 있습니다.`);
                    }
                };
                
                document.addEventListener("mousemove", handleZoneDrawMove);
                document.addEventListener("mouseup", handleZoneDrawUp);
                return;
            }
            
            if (activeGshTool === 'add-arrow') {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                
                const currentMap = pathwayMapsStore[currentMapId];
                if (!currentMap) return;
                
                const startPt = getSvgCoords(e.clientX, e.clientY);
                
                // Create dashed preview path
                const arrowsLayer = document.getElementById("gsh-pathway-arrows");
                const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                tempPath.setAttribute("stroke", "#3b82f6");
                tempPath.setAttribute("stroke-width", "2");
                tempPath.setAttribute("stroke-dasharray", "4,4");
                tempPath.setAttribute("fill", "none");
                tempPath.setAttribute("marker-end", "url(#arrowhead)");
                tempPath.setAttribute("d", `M ${startPt.x} ${startPt.y} L ${startPt.x} ${startPt.y}`);
                if (arrowsLayer) arrowsLayer.appendChild(tempPath);
                
                const handleArrowDrawingMove = (mvEvent) => {
                    let currentPt = getSvgCoords(mvEvent.clientX, mvEvent.clientY);
                    
                    if (mvEvent.ctrlKey) {
                        const dx = Math.abs(currentPt.x - startPt.x);
                        const dy = Math.abs(currentPt.y - startPt.y);
                        if (dx > dy) {
                            currentPt.y = startPt.y;
                        } else {
                            currentPt.x = startPt.x;
                        }
                    }
                    
                    tempPath.setAttribute("d", `M ${startPt.x} ${startPt.y} L ${currentPt.x} ${currentPt.y}`);
                };
                
                const handleArrowDrawingUp = (muEvent) => {
                    document.removeEventListener("mousemove", handleArrowDrawingMove);
                    document.removeEventListener("mouseup", handleArrowDrawingUp);
                    
                    tempPath.remove();
                    
                    let endPt = getSvgCoords(muEvent.clientX, muEvent.clientY);
                    
                    if (muEvent.ctrlKey) {
                        const dx = Math.abs(endPt.x - startPt.x);
                        const dy = Math.abs(endPt.y - startPt.y);
                        if (dx > dy) {
                            endPt.y = startPt.y;
                        } else {
                            endPt.x = startPt.x;
                        }
                    }
                    
                    const dist = Math.sqrt(Math.pow(endPt.x - startPt.x, 2) + Math.pow(endPt.y - startPt.y, 2));
                    
                    if (dist > 8) {
                        const selectedType = document.querySelector('input[name="arrow-type"]:checked')?.value || 'straight';
                        const selectedDir = document.querySelector('input[name="arrow-dir"]:checked')?.value || 'forward';
                        const isDashed = document.getElementById('arrow-dashed-check')?.checked || false;
                        
                        const newArrowId = `arrow_${Date.now()}`;
                        const newArrow = {
                            id: newArrowId,
                            from: null,
                            to: null,
                            fromCoords: startPt,
                            toCoords: endPt,
                            type: selectedType,
                            direction: selectedDir,
                            dashed: isDashed
                        };
                        currentMap.arrows.push(newArrow);
                        saveAllPathwayMaps();
                        pushGshHistory();
                        renderGSHPathway();
                    }
                };
                
                document.addEventListener("mousemove", handleArrowDrawingMove);
                document.addEventListener("mouseup", handleArrowDrawingUp);
                return;
            }
            
            // Drag marquee selection ONLY when clicking SVG background
            if (e.target.tagName !== "rect" && e.target.id !== "gsh-pathway-svg" && e.target.id !== "gsh-bg-rect") {
                return;
            }
            if (e.button !== 0) return;
            
            if (activeGshTool) return; // ignore marquee selection when edit tools are active
            
            isMarqueeSelecting = true;
            const rect = wrapper.getBoundingClientRect();
            marqueeStartX = e.clientX - rect.left;
            marqueeStartY = e.clientY - rect.top;
            
            marqueeEl.style.left = `${marqueeStartX}px`;
            marqueeEl.style.top = `${marqueeStartY}px`;
            marqueeEl.style.width = "0px";
            marqueeEl.style.height = "0px";
            marqueeEl.style.display = "block";
            
            if (!e.ctrlKey && !e.shiftKey) {
                clearSelection();
                renderGSHPathway();
            }
            
            const handleMarqueeMove = (mvEvent) => {
                if (!isMarqueeSelecting) return;
                
                const currentX = mvEvent.clientX - rect.left;
                const currentY = mvEvent.clientY - rect.top;
                
                const x = Math.min(marqueeStartX, currentX);
                const y = Math.min(marqueeStartY, currentY);
                const w = Math.abs(marqueeStartX - currentX);
                const h = Math.abs(marqueeStartY - currentY);
                
                marqueeEl.style.left = `${x}px`;
                marqueeEl.style.top = `${y}px`;
                marqueeEl.style.width = `${w}px`;
                marqueeEl.style.height = `${h}px`;
            };
            
            const handleMarqueeUp = (muEvent) => {
                if (!isMarqueeSelecting) return;
                isMarqueeSelecting = false;
                marqueeEl.style.display = "none";
                
                document.removeEventListener("mousemove", handleMarqueeMove);
                document.removeEventListener("mouseup", handleMarqueeUp);
                
                const currentX = muEvent.clientX - rect.left;
                const currentY = muEvent.clientY - rect.top;
                
                const x1 = Math.min(marqueeStartX, currentX);
                const y1 = Math.min(marqueeStartY, currentY);
                const x2 = Math.max(marqueeStartX, currentX);
                const y2 = Math.max(marqueeStartY, currentY);
                
                // If it is just a tiny click, do not perform box selection
                if (x2 - x1 < 4 && y2 - y1 < 4) {
                    return;
                }
                
                const currentMap = pathwayMapsStore[currentMapId];
                if (!currentMap) return;
                
                const mapWidth = currentMap.width || 1024;
                const mapHeight = currentMap.height || 580;
                
                // Helper: determines if relative SVG coordinate (cx, cy) falls within marquee selection rectangle
                const isPointInMarquee = (cx, cy) => {
                    const svgEl = document.getElementById("gsh-pathway-svg");
                    const viewport = document.getElementById("gsh-pathway-viewport");
                    if (!svgEl || !viewport) return false;
                    const ctm = viewport.getScreenCTM();
                    if (!ctm) return false;
                    
                    const pt = svgEl.createSVGPoint();
                    pt.x = cx;
                    pt.y = cy;
                    const screenPt = pt.matrixTransform(ctm);
                    const containerX = screenPt.x - rect.left;
                    const containerY = screenPt.y - rect.top;
                    
                    return containerX >= x1 && containerX <= x2 && containerY >= y1 && containerY <= y2;
                };
                
                // 1. Gather nodes
                currentMap.nodes.forEach(node => {
                    const corners = [
                        { x: node.x, y: node.y },
                        { x: node.x + node.w, y: node.y },
                        { x: node.x, y: node.y + node.h },
                        { x: node.x + node.w, y: node.y + node.h }
                    ];
                    const isInside = corners.some(c => isPointInMarquee(c.x, c.y));
                    if (isInside) {
                        selectedNodes.add(node.id);
                    }
                });
                
                // 2. Gather genes (using same ID alignment as overlay renderer)
                const savedOffsets = getGshGeneOffsets(currentMapId);
                const customGenes = getGshCustomGenes(currentMapId);
                const results = window.lastGSHResults || {};
                
                const genesToRender = [];
                const deletedDefaults = getGshDeletedDefaultGenes(currentMapId);
                
                // Add Default Genes if not deleted (Only for yeast_gsh_pathway)
                if (currentMapId === "yeast_gsh_pathway") {
                    Object.keys(results).forEach(symbol => {
                        if (!deletedDefaults.includes(symbol)) {
                            const item = results[symbol];
                            genesToRender.push({
                                id: symbol,
                                x: item.x,
                                y: item.y
                            });
                        }
                    });
                }
                
                // Add Custom Genes
                customGenes.forEach(cg => {
                    const uniqueId = cg.id || `gene_legacy_${cg.symbol}_${Math.random()}`;
                    genesToRender.push({
                        id: uniqueId,
                        x: cg.x,
                        y: cg.y
                    });
                });
                
                // Check each gene's bounding area fallback
                genesToRender.forEach(item => {
                    const baseX = (item.x * mapWidth) / 100;
                    const baseY = (item.y * mapHeight) / 100;
                    const offset = savedOffsets[item.id] || { dx: 0, dy: 0 };
                    const finalX = baseX + offset.dx;
                    const finalY = baseY + offset.dy;
                    
                    if (isPointInMarquee(finalX, finalY)) {
                        selectedGenes.add(item.id);
                    }
                });
                
                // 3. Gather arrows (if both ends or either end falls inside selection rectangle)
                currentMap.arrows.forEach(arrow => {
                    const nodesMap = getNodesMap();
                    const fromNode = arrow.from ? nodesMap[arrow.from] : null;
                    const toNode = arrow.to ? nodesMap[arrow.to] : null;
                    
                    let p1 = fromNode ? { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h / 2 } : (arrow.fromCoords || { x: 100, y: 100 });
                    let p2 = toNode ? { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h / 2 } : (arrow.toCoords || { x: 200, y: 200 });
                    
                    if (isPointInMarquee(p1.x, p1.y) || isPointInMarquee(p2.x, p2.y)) {
                        selectedArrows.add(arrow.id);
                    }
                });
                
                renderGSHPathway();
            };
            
            document.addEventListener("mousemove", handleMarqueeMove);
            document.addEventListener("mouseup", handleMarqueeUp);
        }
    });
    
    window.addEventListener("mousemove", (e) => {
        if (!gshIsDragging) return;
        gshZoomPanX = e.clientX - gshStartX;
        gshZoomPanY = e.clientY - gshStartY;
        applyTransform();
    });
    
    window.addEventListener("mouseup", () => {
        if (gshIsDragging) {
            gshIsDragging = false;
            wrapper.style.cursor = isGshEditMode ? "default" : "grab";
        }
    });
}

function adjustZoom(amount) {
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    if (!wrapper) return;
    
    const rect = wrapper.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const contentX = (centerX - gshZoomPanX) / gshZoomScale;
    const contentY = (centerY - gshZoomPanY) / gshZoomScale;
    
    const newScale = Math.max(0.6, Math.min(3.5, gshZoomScale + amount));
    
    gshZoomPanX = centerX - contentX * newScale;
    gshZoomPanY = centerY - contentY * newScale;
    gshZoomScale = newScale;
    
    applyTransform();
}

function fitGSHPathwayToScreen() {
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    if (!wrapper) return;
    const currentMap = pathwayMapsStore[currentMapId] || {};
    const mapW = currentMap.width || 1024;
    const mapH = currentMap.height || 580;
    const isFs = isPathwayFullscreen();
    const pad = isFs ? 60 : 30;
    const availW = Math.max(100, wrapper.clientWidth - pad * 2);
    const availH = Math.max(100, wrapper.clientHeight - pad * 2);
    const scale = Math.min(availW / mapW, availH / mapH);
    gshZoomScale = Math.max(0.4, Math.min(3.5, Number(scale.toFixed(3))));
    
    // SVG 가운데 정렬
    gshZoomPanX = Math.round((wrapper.clientWidth - mapW * gshZoomScale) / 2);
    gshZoomPanY = Math.round((wrapper.clientHeight - mapH * gshZoomScale) / 2);
    applyTransform();
    
    if (wrapper) wrapper.style.cursor = isGshEditMode ? "default" : "grab";
}

function resetGSHZoom() {
    fitGSHPathwayToScreen();
}

function isPathwayFullscreen() {
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    return Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        (wrapper && wrapper.classList.contains("gsh-pathway-fullscreen-active"))
    );
}

function updateFullscreenUI(isFullscreen) {
    const btnToggle = document.getElementById("btn-toggle-pathway-fullscreen");
    const iconHeader = document.getElementById("pathway-fullscreen-icon");
    const textHeader = document.getElementById("pathway-fullscreen-text");
    const iconInner = document.getElementById("inner-fullscreen-icon");
    const btnInner = document.getElementById("btn-pathway-fullscreen");
    const hudEl = document.getElementById("gsh-fullscreen-hud");
    const hudTitle = document.getElementById("gsh-fs-map-title");
    const currentMap = pathwayMapsStore[currentMapId];

    if (isFullscreen) {
        if (iconHeader) {
            iconHeader.className = "fa-solid fa-compress";
            iconHeader.style.color = "#ef4444";
        }
        if (textHeader) textHeader.textContent = "화면 복귀";
        if (btnToggle) btnToggle.title = "전체화면 모드 종료 (Esc / F11)";
        if (iconInner) iconInner.className = "fa-solid fa-compress";
        if (btnInner) btnInner.title = "전체화면 모드 종료 (Esc / F11)";
        if (hudEl) hudEl.style.display = "flex";
        if (hudTitle) hudTitle.textContent = currentMap?.name || "대사 경로 전체화면 모드";
    } else {
        if (iconHeader) {
            iconHeader.className = "fa-solid fa-expand";
            iconHeader.style.color = "#0284c7";
        }
        if (textHeader) textHeader.textContent = "전체화면";
        if (btnToggle) btnToggle.title = "대사 경로 전체화면 모드 (단축키: F11 / 더블클릭)";
        if (iconInner) iconInner.className = "fa-solid fa-expand";
        if (btnInner) btnInner.title = "전체화면 모드 (단축키: F11 / 더블클릭)";
        if (hudEl) hudEl.style.display = "none";
    }

    // Sync HUD FC toggle button label/state
    const hudFcBtn = document.getElementById("btn-fs-toggle-fc");
    if (hudFcBtn) {
        if (typeof showGshFcValues !== "undefined" && showGshFcValues) {
            hudFcBtn.style.background = "rgba(16, 185, 129, 0.3)";
            hudFcBtn.style.borderColor = "rgba(16, 185, 129, 0.6)";
            hudFcBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Log2FC 표시 중</span>';
        } else {
            hudFcBtn.style.background = "rgba(255, 255, 255, 0.15)";
            hudFcBtn.style.borderColor = "rgba(255, 255, 255, 0.25)";
            hudFcBtn.innerHTML = '<i class="fa-solid fa-calculator"></i><span>Log2FC 표시</span>';
        }
    }

    // Smoothly re-fit zoom and center after layout transition
    setTimeout(() => {
        fitGSHPathwayToScreen();
    }, 60);
    setTimeout(() => {
        fitGSHPathwayToScreen();
    }, 240);
}

function togglePathwayFullscreen(forceState) {
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    if (!wrapper) return;
    
    const currentlyFullscreen = isPathwayFullscreen();
    const targetState = (forceState !== undefined) ? forceState : !currentlyFullscreen;

    if (targetState) {
        // Enter Fullscreen
        wrapper.classList.add("gsh-pathway-fullscreen-active");
        const requestMethod = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen || wrapper.mozRequestFullScreen || wrapper.msRequestFullscreen;
        if (requestMethod) {
            requestMethod.call(wrapper).catch(() => {
                // Ignore API denial; fallback class already applied
            });
        }
        updateFullscreenUI(true);
        showGshToast("🖥️ 대사 경로 전체화면 모드로 전환되었습니다. (Esc로 종료)");
    } else {
        // Exit Fullscreen
        wrapper.classList.remove("gsh-pathway-fullscreen-active");
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            const exitMethod = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exitMethod) {
                exitMethod.call(document).catch(() => {});
            }
        }
        updateFullscreenUI(false);
    }
}

// Global Fullscreen Change Event Listeners
function onPathwayFullscreenChange() {
    const isFs = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    );
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    if (wrapper) {
        if (!isFs && wrapper.classList.contains("gsh-pathway-fullscreen-active")) {
            wrapper.classList.remove("gsh-pathway-fullscreen-active");
        }
    }
    updateFullscreenUI(isPathwayFullscreen());
}
document.addEventListener("fullscreenchange", onPathwayFullscreenChange);
document.addEventListener("webkitfullscreenchange", onPathwayFullscreenChange);
document.addEventListener("mozfullscreenchange", onPathwayFullscreenChange);
document.addEventListener("MSFullscreenChange", onPathwayFullscreenChange);

function applyTransform() {
    const viewport = document.getElementById("gsh-pathway-viewport");
    if (viewport) {
        viewport.setAttribute("transform", `translate(${gshZoomPanX}, ${gshZoomPanY}) scale(${gshZoomScale})`);
    }
}

// Keyboard Hotkey Bindings (Delete, Copy Ctrl+C, Paste Ctrl+V, Arrow Keys Nudge)
let gshNudgeTimer = null;
let gshIsNudging = false;

function initGSHHotkeyBindings() {
    document.addEventListener("keydown", (e) => {
        if (!isGshEditMode) return;
        
        // Prevent hotkeys from triggering when user is editing input forms
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT")) {
            return;
        }
        
        const currentMap = pathwayMapsStore[currentMapId];
        if (!currentMap) return;

        // Arrow Keys Nudge: Move selected nodes, genes, zones, or arrows with pixel precision
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            const hasSelection = (selectedNodes && selectedNodes.size > 0) ||
                                  (selectedGenes && selectedGenes.size > 0) ||
                                  (selectedZones && selectedZones.size > 0) ||
                                  (selectedArrows && selectedArrows.size > 0);
            if (hasSelection) {
                e.preventDefault();

                // If starting a new nudge sequence, push snapshot before movement so Undo reverts back cleanly
                if (!gshIsNudging) {
                    pushGshHistory();
                    gshIsNudging = true;
                }

                // Step size: 2px default, 10px with Shift key
                const step = e.shiftKey ? 10 : 2;
                let dx = 0;
                let dy = 0;
                if (e.key === "ArrowLeft") dx = -step;
                else if (e.key === "ArrowRight") dx = step;
                else if (e.key === "ArrowUp") dy = -step;
                else if (e.key === "ArrowDown") dy = step;

                // 1. Move Selected Nodes
                if (selectedNodes.size > 0) {
                    const nodesMap = getNodesMap();
                    selectedNodes.forEach(nid => {
                        const node = nodesMap[nid];
                        if (node) {
                            node.x += dx;
                            node.y += dy;
                        }
                    });
                }

                // 2. Move Selected Genes (offsets)
                if (selectedGenes.size > 0) {
                    const savedOffsets = getGshGeneOffsets(currentMapId);
                    selectedGenes.forEach(gKey => {
                        const curOff = savedOffsets[gKey] || { dx: 0, dy: 0 };
                        savedOffsets[gKey] = {
                            dx: Math.round((curOff.dx + dx) * 10) / 10,
                            dy: Math.round((curOff.dy + dy) * 10) / 10
                        };
                    });
                    setGshGeneOffsets(currentMapId, savedOffsets);
                }

                // 3. Move Selected Zones
                if (selectedZones.size > 0 && Array.isArray(currentMap.zones)) {
                    currentMap.zones.forEach(z => {
                        if (selectedZones.has(z.id)) {
                            z.x += dx;
                            z.y += dy;
                        }
                    });
                }

                // 4. Move Selected Arrows (independent endpoints or custom waypoints)
                if (selectedArrows.size > 0 && Array.isArray(currentMap.arrows)) {
                    currentMap.arrows.forEach(arr => {
                        if (selectedArrows.has(arr.id)) {
                            if (arr.fromCoords) {
                                arr.fromCoords.x += dx;
                                arr.fromCoords.y += dy;
                            }
                            if (arr.toCoords) {
                                arr.toCoords.x += dx;
                                arr.toCoords.y += dy;
                            }
                            if (Array.isArray(arr.waypoints)) {
                                arr.waypoints.forEach(wp => {
                                    wp.x += dx;
                                    wp.y += dy;
                                });
                            }
                        }
                    });
                }

                renderGSHPathway();

                // Debounce saving & final history snapshot so continuous key holding doesn't flood undo stack
                clearTimeout(gshNudgeTimer);
                gshNudgeTimer = setTimeout(() => {
                    saveAllPathwayMaps();
                    pushGshHistory();
                    gshIsNudging = false;
                }, 350);
                return;
            }
        }
        
        // Tab key: Automatically create next connected node to the right
        if (e.key === "Tab") {
            if (selectedNodes.size === 1) {
                e.preventDefault();
                const curId = Array.from(selectedNodes)[0];
                const nodesMap = getNodesMap();
                const curNode = nodesMap[curId];
                if (curNode) {
                    const newId = `node_${Date.now()}`;
                    const newNode = {
                        id: newId,
                        label: "Next_Node",
                        x: Math.round(curNode.x + 130),
                        y: curNode.y,
                        w: curNode.w || 80,
                        h: curNode.h || 24,
                        rx: 12,
                        type: "standard"
                    };
                    currentMap.nodes.push(newNode);
                    
                    // Create connecting arrow
                    const selectedType = document.querySelector('input[name="arrow-type"]:checked')?.value || 'straight';
                    const selectedDir = document.querySelector('input[name="arrow-dir"]:checked')?.value || 'forward';
                    const isDashed = document.getElementById('arrow-dashed-check')?.checked || false;
                    const newArrow = {
                        id: `arr_${curId}_${newId}_${Date.now()}`,
                        from: curId,
                        to: newId,
                        type: selectedType,
                        direction: selectedDir,
                        dashed: isDashed
                    };
                    currentMap.arrows.push(newArrow);
                    
                    // Switch selection to new node
                    selectedNodes.clear();
                    selectedNodes.add(newId);
                    
                    saveAllPathwayMaps();
                    pushGshHistory();
                    renderGSHPathway();
                    showGshToast("⏩ 다음 노드가 자동 생성 및 연결되었습니다 (Tab)");
                }
            }
        }

        // Delete Selection
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            const totalSelected = selectedNodes.size + selectedArrows.size + selectedGenes.size + selectedZones.size;
            if (totalSelected === 0) return;
            
            if (confirm(`선택한 ${totalSelected}개의 요소를 삭제하시겠습니까?`)) {
                const nodesMap = getNodesMap();
                
                // 0. Delete Zones
                if (currentMap.zones && selectedZones.size > 0) {
                    currentMap.zones = currentMap.zones.filter(z => !selectedZones.has(z.id));
                    selectedZones.clear();
                }
                
                // 1. Delete Arrows
                currentMap.arrows = currentMap.arrows.filter(arrow => !selectedArrows.has(arrow.id));
                selectedArrows.clear();
                
                // 2. Delete Nodes (with boundary backup endpoints)
                selectedNodes.forEach(nid => {
                    const node = nodesMap[nid];
                    if (node) {
                        currentMap.arrows.forEach(arrow => {
                            if (arrow.from === node.id) {
                                const pathStr = calculateArrowPath(arrow, nodesMap);
                                const match = pathStr.match(/M\s+([\d.-]+)\s+([\d.-]+)/);
                                if (match) {
                                    arrow.fromCoords = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
                                }
                                arrow.from = null;
                            }
                            if (arrow.to === node.id) {
                                const pathStr = calculateArrowPath(arrow, nodesMap);
                                arrow.toCoords = { x: node.x + node.w / 2, y: node.y + node.h / 2 };
                                arrow.to = null;
                            }
                        });
                        currentMap.nodes = currentMap.nodes.filter(n => n.id !== nid);
                    }
                });
                selectedNodes.clear();
                
                // 3. Delete Genes (integrated ID/Symbol resolver)
                let custom = getGshCustomGenes(currentMapId);
                const offsets = getGshGeneOffsets(currentMapId);
                const deletedDefaults = getGshDeletedDefaultGenes(currentMapId);
                
                selectedGenes.forEach(key => {
                    const isCustomGene = custom.some(cg => (cg.id === key) || (!cg.id && cg.symbol === key));
                    
                    if (isCustomGene) {
                        custom = custom.filter(cg => {
                            if (cg.id) return cg.id !== key;
                            return cg.symbol !== key;
                        });
                    } else {
                        if (!deletedDefaults.includes(key)) {
                            deletedDefaults.push(key);
                        }
                    }
                    delete offsets[key];
                });
                
                setGshCustomGenes(currentMapId, custom);
                setGshGeneOffsets(currentMapId, offsets);
                setGshDeletedDefaultGenes(currentMapId, deletedDefaults);
                selectedGenes.clear();
                
                saveAllPathwayMaps();
                renderGSHPathway(); // Render immediately using local memory store to bypass REST loading delays
            }
        }
        
        // Ctrl + C (Copy)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
            e.preventDefault();
            
            const nodesMap = getNodesMap();
            const customGenes = getGshCustomGenes(currentMapId);
            const savedOffsets = getGshGeneOffsets(currentMapId);
            
            const copiedNodes = [];
            const copiedArrows = [];
            const copiedGenes = [];
            
            selectedNodes.forEach(nid => {
                const node = nodesMap[nid];
                if (node) copiedNodes.push(JSON.parse(JSON.stringify(node)));
            });
            
            selectedArrows.forEach(aid => {
                const arrow = currentMap.arrows.find(a => a.id === aid);
                if (arrow) copiedArrows.push(JSON.parse(JSON.stringify(arrow)));
            });
            
            selectedGenes.forEach(key => {
                const isCustom = customGenes.some(cg => cg.symbol === key);
                const offset = savedOffsets[key] || { dx: 0, dy: 0 };
                
                let geneObj = null;
                if (isCustom) {
                    const cg = customGenes.find(g => g.symbol === key);
                    geneObj = JSON.parse(JSON.stringify(cg));
                    geneObj.isCustom = true;
                } else {
                    const deg = window.lastGSHResults[key];
                    if (deg) {
                        geneObj = {
                            symbol: key,
                            x: deg.x,
                            y: deg.y,
                            rep_log2fc: deg.rep_log2fc,
                            genes: deg.genes,
                            isCustom: false
                        };
                    }
                }
                if (geneObj) {
                    geneObj.dx = offset.dx;
                    geneObj.dy = offset.dy;
                    copiedGenes.push(geneObj);
                }
            });
            
            if (copiedNodes.length > 0 || copiedArrows.length > 0 || copiedGenes.length > 0) {
                clipboardBuffer = {
                    nodes: copiedNodes,
                    arrows: copiedArrows,
                    genes: copiedGenes
                };
            }
        }
        
        // Ctrl + V (Paste)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
            e.preventDefault();
            if (!clipboardBuffer) return;
            
            const idMap = {};
            const timestamp = Date.now();
            clearSelection();
            
            // Paste Nodes
            clipboardBuffer.nodes.forEach((oldNode, idx) => {
                const newNode = JSON.parse(JSON.stringify(oldNode));
                newNode.id = `node_${timestamp}_${idx}_${Math.round(Math.random() * 100)}`;
                newNode.x += 40; // paste spacing offset
                newNode.y += 40;
                idMap[oldNode.id] = newNode.id;
                
                currentMap.nodes.push(newNode);
                selectedNodes.add(newNode.id);
            });
            
            // Paste Genes
            const customGenes = getGshCustomGenes(currentMapId);
            const savedOffsets = getGshGeneOffsets(currentMapId);
            
            clipboardBuffer.genes.forEach((g) => {
                let symbol = g.symbol;
                let suffix = 1;
                while (
                    customGenes.some(cg => cg.symbol === symbol) || 
                    (window.lastGSHResults[symbol] && !clipboardBuffer.genes.some(bg => bg.symbol === symbol && bg.isCustom === false))
                ) {
                    symbol = `${g.symbol}_copy${suffix}`;
                    suffix++;
                }
                
                customGenes.push({
                    symbol: symbol,
                    x: g.x,
                    y: g.y,
                    rep_log2fc: g.rep_log2fc,
                    genes: g.genes
                });
                
                savedOffsets[symbol] = {
                    dx: g.dx + 40,
                    dy: g.dy + 40
                };
                
                selectedGenes.add(symbol);
            });
            
            setGshCustomGenes(currentMapId, customGenes);
            setGshGeneOffsets(currentMapId, savedOffsets);
            
            // Paste Arrows
            clipboardBuffer.arrows.forEach((oldArrow, idx) => {
                const newArrow = JSON.parse(JSON.stringify(oldArrow));
                newArrow.id = `arr_${timestamp}_${idx}_${Math.round(Math.random() * 100)}`;
                
                if (oldArrow.from && idMap[oldArrow.from]) {
                    newArrow.from = idMap[oldArrow.from];
                } else if (oldArrow.from) {
                    newArrow.from = oldArrow.from;
                }
                
                if (oldArrow.to && idMap[oldArrow.to]) {
                    newArrow.to = idMap[oldArrow.to];
                } else if (oldArrow.to) {
                    newArrow.to = oldArrow.to;
                }
                
                if (newArrow.fromCoords) {
                    newArrow.fromCoords.x += 40;
                    newArrow.fromCoords.y += 40;
                }
                if (newArrow.toCoords) {
                    newArrow.toCoords.x += 40;
                    newArrow.toCoords.y += 40;
                }
                
                currentMap.arrows.push(newArrow);
                selectedArrows.add(newArrow.id);
            });
            
            saveAllPathwayMaps();
            loadGSHPathwayData();
        }
    });
}

// ----------------------------------------------------------------------
// Custom Pathway Editor Event Bindings
// ----------------------------------------------------------------------
function initGSHEditorBindings() {
    const toggleEdit = document.getElementById("toggle-edit-mode");
    const toolbar = document.getElementById("gsh-editor-toolbar");
    const svgEl = document.getElementById("gsh-pathway-svg");
    const mapSelect = document.getElementById("pathway-map-select");
    
    if (!toggleEdit || !toolbar || !svgEl) return;
    
    // Bind global keyboard shortcuts
    initGSHHotkeyBindings();
    
    // Map dropdown change listener
    if (mapSelect) {
        mapSelect.addEventListener("change", (e) => {
            selectAndLoadMap(e.target.value);
        });
    }
    
    // Create new map
    const btnCreateMap = document.getElementById("btn-create-map");
    if (btnCreateMap) {
        btnCreateMap.addEventListener("click", () => {
            const name = prompt("새로운 대사 경로 맵 이름을 입력하세요:");
            if (name && name.trim() !== "") {
                const newMapId = `map_${Date.now()}`;
                pathwayMapsStore[newMapId] = {
                    name: name.trim(),
                    species: gCurrentSpecies || "sce",
                    width: 1024,
                    height: 580,
                    nodes: [],
                    arrows: []
                };
                saveAllPathwayMaps();
                currentMapId = newMapId;
                loadGSHPathwayData();
                alert(`'${name.trim()}' 맵이 성공적으로 생성되었습니다.`);
            }
        });
    }
    
    // Rename current map
    const btnRenameMap = document.getElementById("btn-rename-map");
    if (btnRenameMap) {
        btnRenameMap.addEventListener("click", () => {
            const currentMap = pathwayMapsStore[currentMapId];
            if (!currentMap) return;
            const newName = prompt("맵의 새로운 이름을 입력하세요:", currentMap.name);
            if (newName && newName.trim() !== "" && newName.trim() !== currentMap.name) {
                currentMap.name = newName.trim();
                saveAllPathwayMaps();
                loadGSHPathwayData();
                alert("맵 이름이 변경되었습니다.");
            }
        });
    }
    
    // Delete current map
    const btnDeleteMap = document.getElementById("btn-delete-map");
    if (btnDeleteMap) {
        btnDeleteMap.addEventListener("click", () => {
            if (currentMapId === "yeast_gsh_pathway") {
                alert("기본 글루타치온 생합성 맵은 삭제할 수 없습니다.");
                return;
            }
            const currentMap = pathwayMapsStore[currentMapId];
            if (!currentMap) return;
            if (confirm(`'${currentMap.name}' 맵을 정말 완전히 삭제하시겠습니까?`)) {
                // Delete references
                removeGshGeneData(currentMapId);
                
                delete pathwayMapsStore[currentMapId];
                saveAllPathwayMaps();
                currentMapId = "yeast_gsh_pathway";
                loadGSHPathwayData();
                alert("맵이 완전히 삭제되었습니다.");
            }
        });
    }
    
    // Save current pathway map explicitly
    const btnSavePathway = document.getElementById("btn-save-gsh-pathway");
    if (btnSavePathway) {
        btnSavePathway.addEventListener("click", () => {
            saveAllPathwayMaps();
            alert("현재 대사 경로의 노드, 화살표, 유전자 배지 정렬 배치가 성공적으로 저장되었습니다.");
        });
    }

    // Reset current pathway map layout
    const btnResetPathway = document.getElementById("btn-refresh-gsh-pathway");
    if (btnResetPathway) {
        btnResetPathway.addEventListener("click", () => {
            if (confirm("현재 대사 경로의 노드, 화살표 및 배치를 기본값으로 초기화하시겠습니까?")) {
                if (currentMapId === "yeast_gsh_pathway") {
                    fetchDefaultLayout()
                    .then(defaultLayout => {
                        pathwayMapsStore["yeast_gsh_pathway"] = {
                            name: "Yeast GSH Pathway (S. cerevisiae)",
                            species: "sce",
                            width: defaultLayout.width || 1880,
                            height: defaultLayout.height || 1150,
                            zones: defaultLayout.zones || [],
                            nodes: defaultLayout.nodes || [],
                            arrows: defaultLayout.arrows || [],
                            customGenes: defaultLayout.customGenes || [],
                            geneOffsets: defaultLayout.geneOffsets || {}
                        };
                        removeGshGeneData("yeast_gsh_pathway");
                        saveAllPathwayMaps();
                        pushGshHistory();
                        selectAndLoadMap("yeast_gsh_pathway");
                        alert("글루타치온 생합성 맵이 기본 레이아웃으로 초기화되었습니다.");
                    })
                    .catch(err => {
                        alert("초기화 실패: " + err.message);
                    });
                } else {
                    const currentMap = pathwayMapsStore[currentMapId];
                    if (currentMap) {
                        currentMap.nodes = [];
                        currentMap.arrows = [];
                        removeGshGeneData(currentMapId);
                        saveAllPathwayMaps();
                        pushGshHistory();
                        selectAndLoadMap(currentMapId);
                        alert("현재 맵이 초기화되었습니다.");
                    }
                }
            }
        });
    }
    
    // Apply Canvas Dimensions
    const btnApplySize = document.getElementById("btn-apply-size");
    if (btnApplySize) {
        btnApplySize.addEventListener("click", () => {
            const widthVal = parseInt(document.getElementById("canvas-width-input").value, 10);
            const heightVal = parseInt(document.getElementById("canvas-height-input").value, 10);
            
            if (isNaN(widthVal) || isNaN(heightVal) || widthVal < 200 || heightVal < 200) {
                alert("가로세로 크기는 최소 200px 이상 입력해야 합니다.");
                return;
            }
            
            const currentMap = pathwayMapsStore[currentMapId];
            if (currentMap) {
                const oldWidth = currentMap.width || 1024;
                const oldHeight = currentMap.height || 580;
                
                // Get all genes (defaults + custom) to perform offset adjustment
                const savedOffsets = JSON.parse(localStorage.getItem(`gsh_gene_offsets_${currentMapId}`) || "{}");
                const customGenes = JSON.parse(localStorage.getItem(`gsh_custom_genes_${currentMapId}`) || "[]");
                
                // Merge all genes
                const mergedResults = JSON.parse(JSON.stringify(window.lastGSHResults || {}));
                customGenes.forEach(cg => {
                    if (!mergedResults[cg.symbol]) {
                        mergedResults[cg.symbol] = { x: cg.x, y: cg.y };
                    }
                });
                
                // Adjust dx and dy offsets for all genes so their absolute coordinate is preserved
                Object.keys(mergedResults).forEach(key => {
                    const item = mergedResults[key];
                    const oldOffset = savedOffsets[key] || { dx: 0, dy: 0 };
                    
                    const newDx = oldOffset.dx + (item.x * (oldWidth - widthVal)) / 100;
                    const newDy = oldOffset.dy + (item.y * (oldHeight - heightVal)) / 100;
                    
                    savedOffsets[key] = {
                        dx: Math.round(newDx * 10) / 10,
                        dy: Math.round(newDy * 10) / 10
                    };
                });
                localStorage.setItem(`gsh_gene_offsets_${currentMapId}`, JSON.stringify(savedOffsets));
                
                currentMap.width = widthVal;
                currentMap.height = heightVal;
                saveAllPathwayMaps();
                selectAndLoadMap(currentMapId);
                alert(`맵의 해상도가 ${widthVal}x${heightVal}로 조절되었으며, 유전자 정렬 배치가 픽셀 단위로 자동 고정 보정되었습니다.`);
            }
        });
    }
    
    toggleEdit.addEventListener("change", (e) => {
        isGshEditMode = e.target.checked;
        clearSelection();
        if (isGshEditMode) {
            toolbar.style.display = "flex";
        } else {
            toolbar.style.display = "none";
            setGshActiveTool(null);
        }
        renderGSHPathway();
    });
    
    // Header Visualization & Export Buttons
    const btnToggleFcVal = document.getElementById("btn-toggle-fc-values");
    if (btnToggleFcVal) {
        btnToggleFcVal.addEventListener("click", () => {
            showGshFcValues = !showGshFcValues;
            btnToggleFcVal.style.background = showGshFcValues ? "#eff6ff" : "#ffffff";
            btnToggleFcVal.style.color = showGshFcValues ? "#2563eb" : "#475569";
            btnToggleFcVal.style.borderColor = showGshFcValues ? "#93c5fd" : "#cbd5e1";
            renderGSHPathway();
            updateFullscreenUI(isPathwayFullscreen());
            showGshToast(showGshFcValues ? "🔢 유전자 캡슐 내 Log2FC 수치가 표시됩니다." : "유전자 캡슐 내 Log2FC 수치를 숨겼습니다.");
        });
    }
    
    const btnToggleZones = document.getElementById("btn-toggle-pathway-zones");
    if (btnToggleZones) {
        btnToggleZones.addEventListener("click", () => {
            showGshZones = !showGshZones;
            btnToggleZones.style.background = showGshZones ? "#eff6ff" : "#ffffff";
            btnToggleZones.style.color = showGshZones ? "#2563eb" : "#475569";
            btnToggleZones.style.borderColor = showGshZones ? "#93c5fd" : "#cbd5e1";
            renderGSHPathway();
            showGshToast(showGshZones ? "🗂️ 대사 구역(Zone) 배경 박스가 표시됩니다." : "대사 구역(Zone) 배경 박스를 숨겼습니다.");
        });
    }
    
    const btnExportPng = document.getElementById("btn-export-pathway-png");
    if (btnExportPng) {
        btnExportPng.addEventListener("click", () => exportCustomPathwayImage("png"));
    }
    
    const btnExportSvg = document.getElementById("btn-export-pathway-svg");
    if (btnExportSvg) {
        btnExportSvg.addEventListener("click", () => exportCustomPathwayImage("svg"));
    }

    // Pathway Fullscreen Buttons (Header & Floating HUD)
    const btnToggleFs = document.getElementById("btn-toggle-pathway-fullscreen");
    if (btnToggleFs) {
        btnToggleFs.addEventListener("click", () => togglePathwayFullscreen());
    }

    const btnFsExit = document.getElementById("btn-fs-exit");
    if (btnFsExit) {
        btnFsExit.addEventListener("click", () => togglePathwayFullscreen(false));
    }

    const btnFsToggleFc = document.getElementById("btn-fs-toggle-fc");
    if (btnFsToggleFc) {
        btnFsToggleFc.addEventListener("click", () => {
            if (btnToggleFcVal) btnToggleFcVal.click();
        });
    }

    const btnFsZoomIn = document.getElementById("btn-fs-zoom-in");
    if (btnFsZoomIn) {
        btnFsZoomIn.addEventListener("click", () => adjustZoom(0.25));
    }

    const btnFsZoomOut = document.getElementById("btn-fs-zoom-out");
    if (btnFsZoomOut) {
        btnFsZoomOut.addEventListener("click", () => adjustZoom(-0.25));
    }

    const btnFsZoomReset = document.getElementById("btn-fs-zoom-reset");
    if (btnFsZoomReset) {
        btnFsZoomReset.addEventListener("click", () => fitGSHPathwayToScreen());
    }

    // Undo / Redo Toolbar Button Handlers
    const btnUndo = document.getElementById("btn-gsh-undo");
    const btnRedo = document.getElementById("btn-gsh-redo");
    if (btnUndo) btnUndo.addEventListener("click", () => undoGshState());
    if (btnRedo) btnRedo.addEventListener("click", () => redoGshState());

    const toolButtons = {
        'tool-add-node': 'add-node',
        'tool-add-arrow': 'add-arrow',
        'tool-add-gene': 'add-gene',
        'tool-add-zone': 'add-zone',
        'tool-delete': 'delete'
    };
    
    Object.keys(toolButtons).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener("click", () => {
                const tool = toolButtons[btnId];
                if (tool === 'add-gene') {
                    openGeneSearchModal();
                    setGshActiveTool(null);
                } else if (activeGshTool === tool) {
                    setGshActiveTool(null);
                } else {
                    setGshActiveTool(tool);
                    if (tool === 'add-node') {
                        showGshToast("💡 캔버스 빈 곳을 클릭하거나 더블클릭하면 대사산물 노드가 생성됩니다.");
                    } else if (tool === 'add-arrow') {
                        showGshToast("💡 노드 가장자리의 4개 점을 드래그하거나 캔버스를 드래그하여 화살표를 그립니다.");
                    } else if (tool === 'add-zone') {
                        showGshToast("💡 캔버스 위에서 마우스를 드래그하여 대사 구역(Zone) 배경 박스를 그리세요.");
                    }
                }
            });
        }
    });
    
    // Live Arrow Style Update when arrows are selected in Edit Mode
    document.querySelectorAll('input[name="arrow-type"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            if (!isGshEditMode || selectedArrows.size === 0) return;
            const currentMap = pathwayMapsStore[currentMapId];
            if (!currentMap || !currentMap.arrows) return;
            const nodesMap = getNodesMap();
            currentMap.arrows.forEach(a => {
                if (selectedArrows.has(a.id)) {
                    a.type = e.target.value;
                    if (e.target.value === 'orthogonal') {
                        if (!Array.isArray(a.waypoints) || a.waypoints.length === 0) {
                            const fN = a.from ? nodesMap[a.from] : null;
                            const tN = a.to ? nodesMap[a.to] : null;
                            const p1 = a.fromCoords || (fN ? { x: fN.x + fN.w / 2, y: fN.y + fN.h / 2 } : { x: 100, y: 100 });
                            const p2 = a.toCoords || (tN ? { x: tN.x + tN.w / 2, y: tN.y + tN.h / 2 } : { x: 200, y: 200 });
                            a.waypoints = [{ x: Math.round(p1.x), y: Math.round(p2.y) }];
                        }
                    } else if (e.target.value === 'straight' || e.target.value === 'curved') {
                        delete a.waypoints;
                    }
                }
            });
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
        });
    });
    
    document.querySelectorAll('input[name="arrow-dir"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            if (!isGshEditMode || selectedArrows.size === 0) return;
            const currentMap = pathwayMapsStore[currentMapId];
            if (!currentMap || !currentMap.arrows) return;
            currentMap.arrows.forEach(a => {
                if (selectedArrows.has(a.id)) a.direction = e.target.value;
            });
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
        });
    });
    
    const dashedCheck = document.getElementById("arrow-dashed-check");
    if (dashedCheck) {
        dashedCheck.addEventListener("change", (e) => {
            if (!isGshEditMode || selectedArrows.size === 0) return;
            const currentMap = pathwayMapsStore[currentMapId];
            if (!currentMap || !currentMap.arrows) return;
            currentMap.arrows.forEach(a => {
                if (selectedArrows.has(a.id)) a.dashed = e.target.checked;
            });
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
        });
    }
    
    // Distribute Evenly Buttons & Smart Snap Toggle
    const btnDistH = document.getElementById("btn-distribute-h");
    const btnDistV = document.getElementById("btn-distribute-v");
    if (btnDistH) btnDistH.addEventListener("click", () => distributeSelectedElements("horizontal"));
    if (btnDistV) btnDistV.addEventListener("click", () => distributeSelectedElements("vertical"));
    
    const chkSmartSnap = document.getElementById("toggle-smart-snap");
    if (chkSmartSnap) {
        chkSmartSnap.addEventListener("change", (e) => {
            enableGshSmartSnap = e.target.checked;
            showGshToast(enableGshSmartSnap ? "🧲 스마트 자석 스냅 가이드라인이 활성화되었습니다." : "스마트 자석 스냅이 해제되었습니다.");
        });
    }

    // Zone Title Position Toolbar Select Handler
    const zonePosSelect = document.getElementById("zone-title-pos-select");
    if (zonePosSelect) {
        zonePosSelect.addEventListener("change", (e) => {
            if (!isGshEditMode || selectedZones.size === 0) return;
            const currentMap = pathwayMapsStore[currentMapId];
            if (!currentMap || !currentMap.zones) return;
            const newPos = e.target.value;
            currentMap.zones.forEach(z => {
                if (selectedZones.has(z.id)) {
                    z.titlePos = newPos;
                    delete z.titleOffset;
                }
            });
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
            const posNames = {
                "top-left": "좌측 상단",
                "top-center": "상단 중앙",
                "top-right": "우측 상단",
                "bottom-left": "좌측 하단",
                "bottom-center": "하단 중앙",
                "bottom-right": "우측 하단"
            };
            showGshToast(`📍 구역 제목 위치가 '${posNames[newPos] || newPos}'(으)로 변경되었습니다.`);
        });
    }

    // Reaction Wizard Button
    const btnReactionWizard = document.getElementById("btn-reaction-wizard");
    if (btnReactionWizard) {
        btnReactionWizard.addEventListener("click", () => {
            openReactionWizardModal();
        });
    }
    
    // Canvas click handler for node/gene tools
    svgEl.addEventListener("click", (e) => {
        if (!isGshEditMode || !activeGshTool) return;
        
        // Prevent action if clicking on existing nodes, arrows, or gene badges
        if (e.target.closest(".gsh-pathway-node-group") || e.target.closest(".gsh-pathway-arrow-group") || e.target.closest(".gsh-gene-badge-group") || e.target.closest(".gsh-node-anchor-port")) {
            return;
        }
        
        const currentMap = pathwayMapsStore[currentMapId];
        if (!currentMap) return;
        
        const clickPt = getSvgCoords(e.clientX, e.clientY);
        
        if (activeGshTool === 'add-node') {
            showInlineNodeCreator(clickPt.x, clickPt.y, e.clientX, e.clientY);
            setGshActiveTool(null);
        } else if (activeGshTool === 'add-gene') {
            openGeneSearchModal(null, { x: clickPt.x, y: clickPt.y });
            setGshActiveTool(null);
        }
    });

    // Canvas double click handler: Quick Create Node directly without tool selection!
    svgEl.addEventListener("dblclick", (e) => {
        if (!isGshEditMode) return;
        if (e.target.closest(".gsh-pathway-node-group") || e.target.closest(".gsh-pathway-arrow-group") || e.target.closest(".gsh-gene-badge-group") || e.target.closest(".gsh-node-anchor-port") || e.target.closest(".gsh-pathway-zone-group")) {
            return;
        }
        const clickPt = getSvgCoords(e.clientX, e.clientY);
        showInlineNodeCreator(clickPt.x, clickPt.y, e.clientX, e.clientY);
    });
    
    // Node Align Tool Handlers
    const alignTypes = ['left', 'center', 'right', 'top', 'middle', 'bottom'];
    alignTypes.forEach(type => {
        const btn = document.getElementById(`btn-align-${type}`);
        if (btn) {
            btn.addEventListener("click", () => {
                alignSelectedNodes(type);
            });
        }
    });
    
    // Node Color Picker Click Handlers
    const colorBtns = document.querySelectorAll(".node-color-btn");
    colorBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const colorKey = e.target.getAttribute("data-color");
            if (colorKey) {
                changeSelectedNodesColor(colorKey);
            }
        });
    });

    // Export layout JSON
    const btnExport = document.getElementById("btn-export-layout");
    if (btnExport) {
        btnExport.addEventListener("click", () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pathwayMapsStore[currentMapId], null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `${pathwayMapsStore[currentMapId].name.replace(/\s+/g, '_')}_custom_layout.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });
    }
    
    // Import layout JSON trigger
    const btnImportTrigger = document.getElementById("btn-import-layout-trigger");
    const fileImportInput = document.getElementById("file-import-layout");
    if (btnImportTrigger && fileImportInput) {
        btnImportTrigger.addEventListener("click", () => {
            fileImportInput.click();
        });
        
        fileImportInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    if (parsed.nodes && parsed.arrows) {
                        const currentMap = pathwayMapsStore[currentMapId];
                        if (currentMap) {
                            currentMap.width = parsed.width || currentMap.width || 1024;
                            currentMap.height = parsed.height || currentMap.height || 580;
                            if (parsed.zones) currentMap.zones = parsed.zones;
                            currentMap.nodes = parsed.nodes;
                            currentMap.arrows = parsed.arrows;
                            saveAllPathwayMaps();
                            pushGshHistory();
                            selectAndLoadMap(currentMapId);
                            alert("대사 경로 레이아웃이 성공적으로 업로드 및 갱신되었습니다!");
                        }
                    } else {
                        alert("올바른 대사 경로 레이아웃 형식이 아닙니다 (nodes와 arrows 속성이 필요합니다).");
                    }
                } catch (err) {
                    alert("JSON 파일 파싱 실패: " + err.message);
                }
            };
            reader.readAsText(file);
        });
    }
    
    // ----------------------------------------------------------------------
    // Target Gene Engineering UI Events
    // ----------------------------------------------------------------------
    const btnToggleBadges = document.getElementById("btn-toggle-target-badges");
    const btnAddTarget = document.getElementById("btn-add-target-gene");
    const inputTarget = document.getElementById("target-gene-input");
    const inputNote = document.getElementById("target-note-input");
    const btnStratOe = document.getElementById("btn-strat-oe");
    const btnStratKo = document.getElementById("btn-strat-ko");
    const btnExportCsv = document.getElementById("btn-export-target-csv");
    const btnCopyList = document.getElementById("btn-copy-target-list");

    if (btnToggleBadges) {
        btnToggleBadges.addEventListener("click", () => {
            showGshTargetBadges = !showGshTargetBadges;
            localStorage.setItem("gsh_show_target_badges", showGshTargetBadges ? "true" : "false");
            updateTargetBadgeToggleButton();
            renderGSHPathway();
            showGshToast(showGshTargetBadges ? "대사 경로 맵 상에 조작 전략 배지가 표시됩니다." : "대사 경로 맵 상의 조작 전략 배지를 숨겼습니다.");
        });
    }

    if (btnStratOe && btnStratKo) {
        btnStratOe.addEventListener("click", () => {
            currentTargetStrategy = "OE";
            btnStratOe.style.background = "#ef4444";
            btnStratOe.style.color = "#ffffff";
            btnStratOe.style.borderColor = "#ef4444";
            btnStratKo.style.background = "transparent";
            btnStratKo.style.color = "#64748b";
            btnStratKo.style.borderColor = "#cbd5e1";
        });
        btnStratKo.addEventListener("click", () => {
            currentTargetStrategy = "KO";
            btnStratKo.style.background = "#3b82f6";
            btnStratKo.style.color = "#ffffff";
            btnStratKo.style.borderColor = "#3b82f6";
            btnStratOe.style.background = "transparent";
            btnStratOe.style.color = "#64748b";
            btnStratOe.style.borderColor = "#cbd5e1";
        });
    }

    if (btnAddTarget && inputTarget) {
        btnAddTarget.addEventListener("click", () => {
            const sym = inputTarget.value;
            const note = inputNote ? inputNote.value : "";
            addTargetGene(sym, currentTargetStrategy, note);
        });

        inputTarget.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const sym = inputTarget.value;
                const note = inputNote ? inputNote.value : "";
                addTargetGene(sym, currentTargetStrategy, note);
            }
        });
    }

    if (inputNote) {
        inputNote.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && inputTarget) {
                const sym = inputTarget.value;
                const note = inputNote.value;
                addTargetGene(sym, currentTargetStrategy, note);
            }
        });
    }

    if (btnExportCsv) {
        btnExportCsv.addEventListener("click", () => {
            exportTargetGenesCSV();
        });
    }

    if (btnCopyList) {
        btnCopyList.addEventListener("click", () => {
            copyTargetGenesToClipboard();
        });
    }

    // Initialize Advanced Editor Modules
    initInlineNodeCreator();
    initGeneSearchModal();
    initReactionWizard();
}

// ----------------------------------------------------------------------
// 1. Port Drag-to-Connect Arrow Implementation
// ----------------------------------------------------------------------
let isPortConnecting = false;

function startPortConnection(sourceNodeId, startPt, initialEvent) {
    if (isPortConnecting) return;
    isPortConnecting = true;
    
    const arrowsLayer = document.getElementById("gsh-pathway-arrows");
    const currentMap = pathwayMapsStore[currentMapId];
    if (!arrowsLayer || !currentMap) {
        isPortConnecting = false;
        return;
    }
    
    // Create temporary drag preview arrow
    const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempPath.setAttribute("stroke", "#6366f1");
    tempPath.setAttribute("stroke-width", "2.5");
    tempPath.setAttribute("stroke-dasharray", "5, 4");
    tempPath.setAttribute("fill", "none");
    tempPath.setAttribute("marker-end", "url(#arrowhead)");
    tempPath.setAttribute("d", `M ${startPt.x} ${startPt.y} L ${startPt.x} ${startPt.y}`);
    arrowsLayer.appendChild(tempPath);
    
    let hoveredNodeId = null;
    
    const handlePortMove = (mvEvent) => {
        const curPt = getSvgCoords(mvEvent.clientX, mvEvent.clientY);
        tempPath.setAttribute("d", `M ${startPt.x} ${startPt.y} L ${curPt.x} ${curPt.y}`);
        
        // Find if cursor is over a candidate target node
        const elementsUnderCursor = document.elementsFromPoint(mvEvent.clientX, mvEvent.clientY);
        let foundNodeEl = null;
        for (const el of elementsUnderCursor) {
            const nodeGroup = el.closest(".gsh-pathway-node-group");
            if (nodeGroup && nodeGroup.getAttribute("data-id") !== sourceNodeId) {
                foundNodeEl = nodeGroup;
                break;
            }
        }
        
        document.querySelectorAll(".gsh-node-drop-target").forEach(el => el.classList.remove("gsh-node-drop-target"));
        
        if (foundNodeEl) {
            hoveredNodeId = foundNodeEl.getAttribute("data-id");
            foundNodeEl.classList.add("gsh-node-drop-target");
        } else {
            hoveredNodeId = null;
        }
    };
    
    const handlePortUp = (upEvent) => {
        isPortConnecting = false;
        document.removeEventListener("mousemove", handlePortMove);
        document.removeEventListener("mouseup", handlePortUp);
        tempPath.remove();
        
        document.querySelectorAll(".gsh-node-drop-target").forEach(el => el.classList.remove("gsh-node-drop-target"));
        
        if (hoveredNodeId && hoveredNodeId !== sourceNodeId) {
            // Create arrow connection!
            const selectedType = document.querySelector('input[name="arrow-type"]:checked')?.value || 'straight';
            const selectedDir = document.querySelector('input[name="arrow-dir"]:checked')?.value || 'forward';
            const isDashed = document.getElementById('arrow-dashed-check')?.checked || false;
            
            const newArrow = {
                id: `arr_${sourceNodeId}_${hoveredNodeId}_${Date.now()}`,
                from: sourceNodeId,
                to: hoveredNodeId,
                type: selectedType,
                direction: selectedDir,
                dashed: isDashed
            };
            
            currentMap.arrows.push(newArrow);
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
            showGshToast("✨ 화살표가 성공적으로 연결되었습니다.");
        }
    };
    
    document.addEventListener("mousemove", handlePortMove);
    document.addEventListener("mouseup", handlePortUp);
}

// ----------------------------------------------------------------------
// 2. Inline Node Creator Popup
// ----------------------------------------------------------------------
let inlineNodeSvgCoords = { x: 100, y: 100 };

function showInlineNodeCreator(svgX, svgY, clientX, clientY) {
    const creator = document.getElementById("gsh-inline-node-creator");
    const input = document.getElementById("gsh-inline-node-input");
    const wrapper = document.querySelector(".gsh-pathway-wrapper");
    if (!creator || !input || !wrapper) return;
    
    inlineNodeSvgCoords = { x: svgX, y: svgY };
    
    const wrapRect = wrapper.getBoundingClientRect();
    const relX = clientX - wrapRect.left;
    const relY = clientY - wrapRect.top;
    
    creator.style.left = `${Math.min(relX, wrapRect.width - 240)}px`;
    creator.style.top = `${Math.min(relY, wrapRect.height - 50)}px`;
    creator.style.display = "flex";
    
    input.value = "";
    setTimeout(() => input.focus(), 50);
}

function hideInlineNodeCreator() {
    const creator = document.getElementById("gsh-inline-node-creator");
    if (creator) creator.style.display = "none";
}

function submitInlineNode() {
    const input = document.getElementById("gsh-inline-node-input");
    if (!input) return;
    const val = input.value.trim();
    if (!val) {
        hideInlineNodeCreator();
        return;
    }
    
    const currentMap = pathwayMapsStore[currentMapId];
    if (currentMap) {
        if (!currentMap.nodes) currentMap.nodes = [];
        const newId = `node_${Date.now()}`;
        const autoW = Math.max(84, Math.ceil(val.length * 6.5 + 20));
        const newNode = {
            id: newId,
            label: val,
            x: Math.round(inlineNodeSvgCoords.x - autoW / 2),
            y: Math.round(inlineNodeSvgCoords.y - 13),
            w: autoW,
            h: 26,
            rx: 13,
            type: "standard"
        };
        currentMap.nodes.push(newNode);
        saveAllPathwayMaps();
        pushGshHistory();
        renderGSHPathway();
        showGshToast(`대사산물 '${val}' 노드가 생성되었습니다.`);
    }
    hideInlineNodeCreator();
}

function initInlineNodeCreator() {
    const btnSubmit = document.getElementById("btn-inline-node-submit");
    const btnCancel = document.getElementById("btn-inline-node-cancel");
    const input = document.getElementById("gsh-inline-node-input");
    
    if (btnSubmit) btnSubmit.addEventListener("click", submitInlineNode);
    if (btnCancel) btnCancel.addEventListener("click", hideInlineNodeCreator);
    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                submitInlineNode();
            } else if (e.key === "Escape") {
                hideInlineNodeCreator();
            }
        });
    }
}

// ----------------------------------------------------------------------
// 3. Smart Gene Search & Autocomplete Modal
// ----------------------------------------------------------------------
let currentGeneTargetArrowId = null;
let currentGeneTargetCoords = null;

function openGeneSearchModal(targetArrowId = null, coords = null) {
    currentGeneTargetArrowId = targetArrowId;
    currentGeneTargetCoords = coords;
    
    const modal = document.getElementById("gsh-gene-search-modal");
    const input = document.getElementById("gsh-gene-modal-input");
    const suggestions = document.getElementById("gsh-gene-modal-suggestions");
    const attachContainer = document.getElementById("gsh-gene-attach-arrow-container");
    const targetArrowName = document.getElementById("gsh-target-arrow-name");
    const attachCheck = document.getElementById("gsh-gene-attach-arrow-check");
    
    if (!modal || !input) return;
    
    input.value = "";
    if (suggestions) {
        suggestions.innerHTML = "";
        suggestions.style.display = "none";
    }
    
    if (targetArrowId) {
        if (attachContainer) attachContainer.style.display = "block";
        if (attachCheck) attachCheck.checked = true;
        
        const currentMap = pathwayMapsStore[currentMapId];
        const nodesMap = getNodesMap();
        const arrow = currentMap && currentMap.arrows ? currentMap.arrows.find(a => a.id === targetArrowId) : null;
        if (arrow && targetArrowName) {
            const fromLabel = arrow.from && nodesMap[arrow.from] ? nodesMap[arrow.from].label : "시작";
            const toLabel = arrow.to && nodesMap[arrow.to] ? nodesMap[arrow.to].label : "끝";
            targetArrowName.innerText = `${fromLabel} ➔ ${toLabel}`;
        }
    } else {
        if (attachContainer) attachContainer.style.display = "none";
    }
    
    modal.style.display = "flex";
    setTimeout(() => input.focus(), 50);
}

function closeGeneSearchModal() {
    const modal = document.getElementById("gsh-gene-search-modal");
    if (modal) modal.style.display = "none";
    currentGeneTargetArrowId = null;
    currentGeneTargetCoords = null;
}

function initGeneSearchModal() {
    const btnClose = document.getElementById("btn-close-gene-modal");
    const btnCancel = document.getElementById("btn-gene-modal-cancel");
    const btnSubmit = document.getElementById("btn-gene-modal-submit");
    const input = document.getElementById("gsh-gene-modal-input");
    const suggestions = document.getElementById("gsh-gene-modal-suggestions");
    const attachCheck = document.getElementById("gsh-gene-attach-arrow-check");
    
    if (btnClose) btnClose.addEventListener("click", closeGeneSearchModal);
    if (btnCancel) btnCancel.addEventListener("click", closeGeneSearchModal);
    
    if (input && suggestions) {
        input.addEventListener("input", () => {
            const val = input.value;
            // Get current word after last comma
            const parts = val.split(",");
            const query = parts[parts.length - 1].trim().toUpperCase();
            
            if (!query || query.length === 0 || !window.gGenes || window.gGenes.length === 0) {
                suggestions.style.display = "none";
                return;
            }
            
            // Search matches in session genes
            const matched = [];
            for (const g of window.gGenes) {
                const sym = (g.gene_symbol || "").toUpperCase();
                const locus = (g.locus_tag || "").toUpperCase();
                if (sym.includes(query) || locus.includes(query)) {
                    matched.push(g);
                    if (matched.length >= 12) break;
                }
            }
            
            if (matched.length === 0) {
                suggestions.style.display = "none";
                return;
            }
            
            suggestions.innerHTML = "";
            matched.forEach(g => {
                const li = document.createElement("li");
                li.className = "gene-autocomplete-item";
                
                const fc = parseFloat(g.log2fc);
                const fcColor = !isNaN(fc) ? (fc > 0.5 ? '#ef4444' : (fc < -0.5 ? '#3b82f6' : '#64748b')) : '#94a3b8';
                const fcBg = !isNaN(fc) ? (fc > 0.5 ? '#fee2e2' : (fc < -0.5 ? '#dbeafe' : '#f1f5f9')) : '#f1f5f9';
                const fcSign = !isNaN(fc) && fc > 0 ? '+' : '';
                
                li.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="font-size: 13px; color: #0f172a;">${g.gene_symbol || g.locus_tag}</strong>
                        ${g.gene_symbol && g.locus_tag ? `<span style="font-size: 11px; color: #64748b;">(${g.locus_tag})</span>` : ''}
                    </div>
                    <div>
                        ${!isNaN(fc) ? `<span style="font-size: 11px; font-weight: 700; color: ${fcColor}; background: ${fcBg}; padding: 1px 6px; border-radius: 4px;">FC: ${fcSign}${fc.toFixed(2)}</span>` : ''}
                    </div>
                `;
                
                li.addEventListener("click", () => {
                    const pickedSym = (g.gene_symbol || g.locus_tag).trim();
                    parts[parts.length - 1] = " " + pickedSym;
                    input.value = parts.join(",").replace(/^[\s,]+/, "") + ", ";
                    suggestions.style.display = "none";
                    input.focus();
                });
                
                suggestions.appendChild(li);
            });
            
            suggestions.style.display = "block";
        });
        
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (suggestions.style.display === "block" && suggestions.firstElementChild) {
                    suggestions.firstElementChild.click();
                } else {
                    submitGeneSearchModal();
                }
            } else if (e.key === "Escape") {
                if (suggestions.style.display === "block") {
                    suggestions.style.display = "none";
                } else {
                    closeGeneSearchModal();
                }
            }
        });
    }
    
    const submitGeneSearchModal = () => {
        if (!input) return;
        const raw = input.value.trim();
        if (!raw) {
            closeGeneSearchModal();
            return;
        }
        
        const currentMap = pathwayMapsStore[currentMapId];
        if (!currentMap) return;
        
        const mapWidth = currentMap.width || 1024;
        const mapHeight = currentMap.height || 580;
        
        // Parse comma or slash separated symbols
        const rawSymbols = raw.split(/[\/,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
        if (rawSymbols.length === 0) {
            closeGeneSearchModal();
            return;
        }
        
        const custom = getGshCustomGenes(currentMapId);
        const shouldAttachToArrow = attachCheck && attachCheck.checked && currentGeneTargetArrowId;
        
        // Calculate base coords
        let targetX = 50;
        let targetY = 50;
        
        if (currentGeneTargetCoords) {
            targetX = (currentGeneTargetCoords.x / mapWidth) * 100;
            targetY = (currentGeneTargetCoords.y / mapHeight) * 100;
        } else if (shouldAttachToArrow && currentMap.arrows) {
            const arrow = currentMap.arrows.find(a => a.id === currentGeneTargetArrowId);
            if (arrow && arrow._calculated) {
                targetX = (arrow._calculated.midX / mapWidth) * 100;
                targetY = ((arrow._calculated.midY - 14) / mapHeight) * 100;
            }
        }
        
        rawSymbols.forEach((sym, idx) => {
            let repLog2fc = 0.0;
            let geneIsoforms = [];
            if (window.gGenes && window.gGenes.length > 0) {
                const match = window.gGenes.find(g => (g.gene_symbol && g.gene_symbol.toUpperCase() === sym) || (g.locus_tag && g.locus_tag.toUpperCase() === sym));
                if (match) {
                    repLog2fc = parseFloat(match.log2fc) || 0.0;
                    geneIsoforms = [match];
                }
            }
            
            const newGeneId = `gene_${Date.now()}_${Math.round(Math.random() * 1000)}_${idx}`;
            custom.push({
                id: newGeneId,
                symbol: sym,
                x: targetX,
                y: targetY,
                arrowId: shouldAttachToArrow ? currentGeneTargetArrowId : null,
                rep_log2fc: repLog2fc,
                genes: geneIsoforms
            });
        });
        
        setGshCustomGenes(currentMapId, custom);
        saveAllPathwayMaps();
        pushGshHistory();
        closeGeneSearchModal();
        renderGSHPathway();
        showGshToast(`✨ ${rawSymbols.join(", ")} 유전자 배지가 추가되었습니다.`);
    };
    
    if (btnSubmit) btnSubmit.addEventListener("click", submitGeneSearchModal);
}

// ----------------------------------------------------------------------
// 4. Reaction Wizard (Text-to-Pathway Builder)
// ----------------------------------------------------------------------
function openReactionWizardModal() {
    const modal = document.getElementById("gsh-reaction-wizard-modal");
    const textarea = document.getElementById("reaction-wizard-input");
    if (!modal) return;
    
    modal.style.display = "flex";
    if (textarea) setTimeout(() => textarea.focus(), 50);
}

function closeReactionWizardModal() {
    const modal = document.getElementById("gsh-reaction-wizard-modal");
    if (modal) modal.style.display = "none";
}

function initReactionWizard() {
    const btnClose = document.getElementById("btn-close-reaction-wizard");
    const btnCancel = document.getElementById("btn-wizard-cancel");
    const btnApply = document.getElementById("btn-wizard-apply");
    const btnSample = document.getElementById("btn-wizard-load-sample");
    const textarea = document.getElementById("reaction-wizard-input");
    const checkReuse = document.getElementById("wizard-reuse-existing-nodes");
    
    if (btnClose) btnClose.addEventListener("click", closeReactionWizardModal);
    if (btnCancel) btnCancel.addEventListener("click", closeReactionWizardModal);
    
    if (btnSample && textarea) {
        btnSample.addEventListener("click", () => {
            textarea.value = `Glucose -> Glucose-6P : GLK1, HXK2
Glucose-6P <-> Fructose-6P : PGI1
Fructose-6P -> F1,6BP : PFK1, PFK2
F1,6BP <-> DHAP : FBA1
DHAP <-> Glycerol-3P : GPD1, GPD2
Glycerol-3P -> Glycerol : GPP1, GPP2`;
        });
    }
    
    if (btnApply && textarea) {
        btnApply.addEventListener("click", () => {
            const rawText = textarea.value.trim();
            if (!rawText) {
                alert("반응식을 한 줄 이상 입력해주세요.");
                return;
            }
            
            const currentMap = pathwayMapsStore[currentMapId];
            if (!currentMap) return;
            
            if (!currentMap.nodes) currentMap.nodes = [];
            if (!currentMap.arrows) currentMap.arrows = [];
            
            const custom = getGshCustomGenes(currentMapId);
            const reuseExisting = checkReuse ? checkReuse.checked : true;
            
            const lines = rawText.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
            if (lines.length === 0) {
                alert("유효한 반응식이 없습니다.");
                return;
            }
            
            const nodesMapByName = {};
            currentMap.nodes.forEach(n => {
                nodesMapByName[n.label.toUpperCase()] = n;
            });
            
            // Layout baseline cursor coordinates
            let curStartX = 60;
            let curStartY = 60;
            
            // If existing nodes exist, position new cluster below
            if (currentMap.nodes.length > 0) {
                let maxY = 0;
                currentMap.nodes.forEach(n => {
                    if (n.y > maxY) maxY = n.y;
                });
                curStartY = Math.max(60, maxY + 100);
            }
            
            let reactionsCreated = 0;
            let genesCreated = 0;
            
            lines.forEach((line, lineIdx) => {
                const match = line.match(/^([^<>\-:;]+)\s*(<->|->|<-)\s*([^:;]+)(?:\s*[:]\s*(.+))?$/);
                if (!match) return;
                
                const subName = match[1].trim();
                const arrowOp = match[2].trim();
                const prodName = match[3].trim();
                const rawGenes = match[4] ? match[4].trim() : "";
                
                const subKey = subName.toUpperCase();
                const prodKey = prodName.toUpperCase();
                
                // 1. Get or Create Substrate Node
                let subNode = reuseExisting ? nodesMapByName[subKey] : null;
                if (!subNode) {
                    subNode = {
                        id: `node_${Date.now()}_sub_${lineIdx}_${Math.round(Math.random()*100)}`,
                        label: subName,
                        x: curStartX,
                        y: curStartY,
                        w: 90,
                        h: 26,
                        rx: 12,
                        type: "standard"
                    };
                    currentMap.nodes.push(subNode);
                    nodesMapByName[subKey] = subNode;
                }
                
                // 2. Get or Create Product Node
                let prodNode = reuseExisting ? nodesMapByName[prodKey] : null;
                if (!prodNode) {
                    prodNode = {
                        id: `node_${Date.now()}_prod_${lineIdx}_${Math.round(Math.random()*100)}`,
                        label: prodName,
                        x: subNode.x + 160,
                        y: subNode.y,
                        w: 90,
                        h: 26,
                        rx: 12,
                        type: "standard"
                    };
                    currentMap.nodes.push(prodNode);
                    nodesMapByName[prodKey] = prodNode;
                }
                
                // 3. Create Arrow
                let arrowFrom = subNode.id;
                let arrowTo = prodNode.id;
                let arrowDir = "forward";
                
                if (arrowOp === "<->") {
                    arrowDir = "both";
                } else if (arrowOp === "<-") {
                    arrowFrom = prodNode.id;
                    arrowTo = subNode.id;
                }
                
                const arrowId = `arr_${arrowFrom}_${arrowTo}_${Date.now()}_${lineIdx}`;
                const newArrow = {
                    id: arrowId,
                    from: arrowFrom,
                    to: arrowTo,
                    type: "straight",
                    direction: arrowDir
                };
                currentMap.arrows.push(newArrow);
                reactionsCreated++;
                
                // 4. Attach Genes if present
                if (rawGenes) {
                    const geneSymbols = rawGenes.split(/[\/,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                    geneSymbols.forEach((sym, gIdx) => {
                        let repLog2fc = 0.0;
                        let geneIsoforms = [];
                        if (window.gGenes && window.gGenes.length > 0) {
                            const found = window.gGenes.find(g => (g.gene_symbol && g.gene_symbol.toUpperCase() === sym) || (g.locus_tag && g.locus_tag.toUpperCase() === sym));
                            if (found) {
                                repLog2fc = parseFloat(found.log2fc) || 0.0;
                                geneIsoforms = [found];
                            }
                        }
                        
                        custom.push({
                            id: `gene_wiz_${Date.now()}_${lineIdx}_${gIdx}`,
                            symbol: sym,
                            x: ((subNode.x + prodNode.x) / 2 / (currentMap.width || 1024)) * 100,
                            y: (subNode.y / (currentMap.height || 580)) * 100,
                            arrowId: arrowId,
                            rep_log2fc: repLog2fc,
                            genes: geneIsoforms
                        });
                        genesCreated++;
                    });
                }
                
                // Shift layout Y down for next step
                curStartY += 65;
            });
            
            setGshCustomGenes(currentMapId, custom);
            saveAllPathwayMaps();
            pushGshHistory();
            closeReactionWizardModal();
            renderGSHPathway();
            showGshToast(`🎉 마법사로 ${reactionsCreated}개 반응 및 ${genesCreated}개 유전자가 생성되었습니다!`);
        });
    }
}

function setGshActiveTool(tool) {
    activeGshTool = tool;
    selectedArrowSourceId = null; // reset arrow state
    
    const btns = document.querySelectorAll(".edit-tool-btn");
    btns.forEach(btn => btn.classList.remove("active"));
    
    const toolBtnMap = {
        'add-node': 'tool-add-node',
        'add-arrow': 'tool-add-arrow',
        'add-gene': 'tool-add-gene',
        'add-zone': 'tool-add-zone',
        'delete': 'tool-delete'
    };
    
    if (tool && toolBtnMap[tool]) {
        const activeBtn = document.getElementById(toolBtnMap[tool]);
        if (activeBtn) activeBtn.classList.add("active");
    }
}

function alignSelectedNodes(alignmentType) {
    if (selectedNodes.size >= 2) {
        const nodesMap = getNodesMap();
        const selNodes = Array.from(selectedNodes).map(id => nodesMap[id]).filter(n => n !== undefined);
        if (selNodes.length < 2) return;
        
        if (alignmentType === 'left') {
            const minX = Math.min(...selNodes.map(n => n.x));
            selNodes.forEach(n => { n.x = minX; });
        } else if (alignmentType === 'center') {
            const avgCenterX = selNodes.reduce((sum, n) => sum + (n.x + n.w / 2), 0) / selNodes.length;
            selNodes.forEach(n => { n.x = Math.round(avgCenterX - n.w / 2); });
        } else if (alignmentType === 'right') {
            const maxRight = Math.max(...selNodes.map(n => n.x + n.w));
            selNodes.forEach(n => { n.x = maxRight - n.w; });
        } else if (alignmentType === 'top') {
            const minY = Math.min(...selNodes.map(n => n.y));
            selNodes.forEach(n => { n.y = minY; });
        } else if (alignmentType === 'middle') {
            const avgCenterY = selNodes.reduce((sum, n) => sum + (n.y + n.h / 2), 0) / selNodes.length;
            selNodes.forEach(n => { n.y = Math.round(avgCenterY - n.h / 2); });
        } else if (alignmentType === 'bottom') {
            const maxBottom = Math.max(...selNodes.map(n => n.y + n.h));
            selNodes.forEach(n => { n.y = maxBottom - n.h; });
        }
        
        saveAllPathwayMaps();
        pushGshHistory();
        renderGSHPathway();
        return;
    }
    
    // Also support aligning selected gene badges when 2+ genes are selected!
    if (selectedGenes.size >= 2) {
        const currentMap = pathwayMapsStore[currentMapId] || {};
        const mapWidth = currentMap.width || 1024;
        const mapHeight = currentMap.height || 580;
        const savedOffsets = getGshGeneOffsets(currentMapId);
        const customGenes = getGshCustomGenes(currentMapId);
        const results = window.lastGSHResults || {};
        
        const selGeneItems = [];
        selectedGenes.forEach(gKey => {
            const gItem = customGenes.find(cg => (cg.id === gKey) || (!cg.id && cg.symbol === gKey)) || results[gKey];
            if (gItem) {
                const baseX = (gItem.x * mapWidth) / 100;
                const baseY = (gItem.y * mapHeight) / 100;
                const off = savedOffsets[gKey] || { dx: 0, dy: 0 };
                selGeneItems.push({ key: gKey, baseX, baseY, absX: baseX + off.dx, absY: baseY + off.dy });
            }
        });
        if (selGeneItems.length >= 2) {
            if (alignmentType === 'left' || alignmentType === 'center' || alignmentType === 'right') {
                const targetX = alignmentType === 'left'
                    ? Math.min(...selGeneItems.map(g => g.absX))
                    : alignmentType === 'right'
                        ? Math.max(...selGeneItems.map(g => g.absX))
                        : selGeneItems.reduce((s, g) => s + g.absX, 0) / selGeneItems.length;
                selGeneItems.forEach(g => {
                    const prev = savedOffsets[g.key] || { dx: 0, dy: 0 };
                    savedOffsets[g.key] = { dx: Math.round((targetX - g.baseX) * 10) / 10, dy: prev.dy };
                });
            } else {
                const targetY = alignmentType === 'top'
                    ? Math.min(...selGeneItems.map(g => g.absY))
                    : alignmentType === 'bottom'
                        ? Math.max(...selGeneItems.map(g => g.absY))
                        : selGeneItems.reduce((s, g) => s + g.absY, 0) / selGeneItems.length;
                selGeneItems.forEach(g => {
                    const prev = savedOffsets[g.key] || { dx: 0, dy: 0 };
                    savedOffsets[g.key] = { dx: prev.dx, dy: Math.round((targetY - g.baseY) * 10) / 10 };
                });
            }
            setGshGeneOffsets(currentMapId, savedOffsets);
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
            return;
        }
    }
    
    alert("정렬 기능을 사용하려면 최소 2개 이상의 노드 또는 유전자 배지를 선택해 주세요.");
}

function distributeSelectedElements(direction) {
    if (selectedNodes.size >= 3) {
        const nodesMap = getNodesMap();
        const selNodes = Array.from(selectedNodes).map(id => nodesMap[id]).filter(Boolean);
        if (selNodes.length >= 3) {
            if (direction === "horizontal") {
                selNodes.sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2));
                const firstC = selNodes[0].x + selNodes[0].w / 2;
                const lastC = selNodes[selNodes.length - 1].x + selNodes[selNodes.length - 1].w / 2;
                const step = (lastC - firstC) / (selNodes.length - 1);
                selNodes.forEach((n, i) => {
                    n.x = Math.round(firstC + step * i - n.w / 2);
                });
            } else {
                selNodes.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
                const firstC = selNodes[0].y + selNodes[0].h / 2;
                const lastC = selNodes[selNodes.length - 1].y + selNodes[selNodes.length - 1].h / 2;
                const step = (lastC - firstC) / (selNodes.length - 1);
                selNodes.forEach((n, i) => {
                    n.y = Math.round(firstC + step * i - n.h / 2);
                });
            }
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
            showGshToast(`📐 선택한 ${selNodes.length}개 노드의 간격이 균등 배분되었습니다.`);
            return;
        }
    }
    
    if (selectedGenes.size >= 2) {
        const currentMap = pathwayMapsStore[currentMapId] || {};
        const mapWidth = currentMap.width || 1024;
        const mapHeight = currentMap.height || 580;
        const savedOffsets = getGshGeneOffsets(currentMapId);
        const customGenes = getGshCustomGenes(currentMapId);
        const results = window.lastGSHResults || {};
        
        const selGeneItems = [];
        selectedGenes.forEach(gKey => {
            const gItem = customGenes.find(cg => (cg.id === gKey) || (!cg.id && cg.symbol === gKey)) || results[gKey];
            if (gItem) {
                const baseX = (gItem.x * mapWidth) / 100;
                const baseY = (gItem.y * mapHeight) / 100;
                const off = savedOffsets[gKey] || { dx: 0, dy: 0 };
                selGeneItems.push({ key: gKey, baseX, baseY, absX: baseX + off.dx, absY: baseY + off.dy });
            }
        });
        
        if (selGeneItems.length >= 2) {
            if (direction === "horizontal") {
                selGeneItems.sort((a, b) => a.absX - b.absX);
                const firstX = selGeneItems[0].absX;
                const lastX = selGeneItems[selGeneItems.length - 1].absX;
                const step = selGeneItems.length >= 3 ? Math.max(46, (lastX - firstX) / (selGeneItems.length - 1)) : 52;
                selGeneItems.forEach((g, i) => {
                    const prev = savedOffsets[g.key] || { dx: 0, dy: 0 };
                    savedOffsets[g.key] = { dx: Math.round((firstX + step * i - g.baseX) * 10) / 10, dy: prev.dy };
                });
            } else {
                selGeneItems.sort((a, b) => a.absY - b.absY);
                const firstY = selGeneItems[0].absY;
                const lastY = selGeneItems[selGeneItems.length - 1].absY;
                const step = selGeneItems.length >= 3 ? Math.max(17.5, (lastY - firstY) / (selGeneItems.length - 1)) : 18;
                selGeneItems.forEach((g, i) => {
                    const prev = savedOffsets[g.key] || { dx: 0, dy: 0 };
                    savedOffsets[g.key] = { dx: prev.dx, dy: Math.round((firstY + step * i - g.baseY) * 10) / 10 };
                });
            }
            setGshGeneOffsets(currentMapId, savedOffsets);
            saveAllPathwayMaps();
            pushGshHistory();
            renderGSHPathway();
            showGshToast(`📐 선택한 ${selGeneItems.length}개 유전자 배지의 간격이 깔끔하게 균등 배분되었습니다.`);
            return;
        }
    }
    
    alert("간격 균등 배분을 사용하려면 3개 이상의 노드 또는 2개 이상의 유전자 배지를 선택해 주세요.");
}

function changeSelectedNodesColor(colorKey) {
    if (selectedNodes.size === 0 && selectedZones.size === 0) {
        alert("색상을 변경할 노드 또는 대사 구역(Zone) 박스를 먼저 선택해 주세요.");
        return;
    }
    
    const colorMap = {
        blue: { fill: "#eff6ff", stroke: "#3b82f6", text: "#1e3a8a" },
        green: { fill: "#ecfdf5", stroke: "#10b981", text: "#065f46" },
        red: { fill: "#fef2f2", stroke: "#ef4444", text: "#7f1d1d" },
        yellow: { fill: "#fffbeb", stroke: "#f59e0b", text: "#78350f" },
        purple: { fill: "#faf5ff", stroke: "#8b5cf6", text: "#581c87" },
        gray: { fill: "#f8fafc", stroke: "#64748b", text: "#334155" }
    };
    
    const colors = colorMap[colorKey];
    if (!colors) return;
    
    const nodesMap = getNodesMap();
    selectedNodes.forEach(nid => {
        const node = nodesMap[nid];
        if (node) {
            node.fillColor = colors.fill;
            node.strokeColor = colors.stroke;
            node.textColor = colors.text;
        }
    });
    
    const currentMap = pathwayMapsStore[currentMapId];
    if (currentMap && currentMap.zones && selectedZones.size > 0) {
        currentMap.zones.forEach(z => {
            if (selectedZones.has(z.id)) {
                z.color = colorKey;
            }
        });
    }
    
    saveAllPathwayMaps();
    pushGshHistory();
    renderGSHPathway();
}

function exportCustomPathwayImage(format = "png") {
    const svgEl = document.getElementById("gsh-pathway-svg");
    const currentMap = pathwayMapsStore[currentMapId];
    if (!svgEl || !currentMap) return;
    
    const mapWidth = currentMap.width || 1880;
    const mapHeight = currentMap.height || 1150;
    const cloneSvg = svgEl.cloneNode(true);
    
    cloneSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    cloneSvg.setAttribute("width", mapWidth);
    cloneSvg.setAttribute("height", mapHeight);
    cloneSvg.setAttribute("viewBox", `0 0 ${mapWidth} ${mapHeight}`);
    
    // Reset viewport zoom/pan so the full pathway map exports cleanly
    const cloneViewport = cloneSvg.querySelector("#gsh-pathway-viewport");
    if (cloneViewport) {
        cloneViewport.setAttribute("transform", "translate(0, 0) scale(1)");
    }
    
    // Remove editor grid background and smart guides from exported figure
    const cloneGrid = cloneSvg.querySelector("#gsh-grid-group");
    if (cloneGrid) cloneGrid.remove();
    const cloneGuides = cloneSvg.querySelector("#gsh-smart-guides");
    if (cloneGuides) cloneGuides.remove();
    cloneSvg.querySelectorAll(".gsh-node-anchor-port, .gsh-zone-resize-handle, .gsh-zone-pos-badge, .arrow-gene-add-btn").forEach(el => el.remove());
    
    // Replace <foreignObject> gene badges with pure vector SVG <g> capsules so PNG/SVG export is 100% crisp and never taints Canvas
    const cloneOverlay = cloneSvg.querySelector("#gsh-pathway-overlay");
    if (cloneOverlay) {
        const fos = Array.from(cloneOverlay.querySelectorAll("foreignObject"));
        fos.forEach(fo => {
            const x = parseFloat(fo.getAttribute("x") || "0");
            const y = parseFloat(fo.getAttribute("y") || "0");
            const box = fo.querySelector(".gsh-gene-overlay-container");
            const symEl = fo.querySelector(".gsh-gene-text");
            const indEl = fo.querySelector(".gsh-gene-indicator");
            const fcEl = fo.querySelector(".gsh-gene-fc-val");
            const tgtEl = fo.querySelector(".gsh-map-target-badge-oe, .gsh-map-target-badge-ko");
            if (!box || !symEl) {
                fo.remove();
                return;
            }
            const sym = symEl.textContent || "";
            const fcStr = fcEl ? (fcEl.textContent || "") : "";
            const tgtStr = tgtEl ? (tgtEl.textContent || "") : "";
            const isUp = box.classList.contains("gsh-pill-up");
            const isDown = box.classList.contains("gsh-pill-down");
            
            const pillStroke = isUp ? "rgba(239, 68, 68, 0.45)" : isDown ? "rgba(99, 102, 241, 0.45)" : "rgba(148, 163, 184, 0.42)";
            const indFill = indEl && indEl.style.backgroundColor ? indEl.style.backgroundColor : (isUp ? "#ef4444" : isDown ? "#6366f1" : "#cbd5e1");
            
            const symWidth = Math.max(24, sym.length * 6.3);
            const fcWidth = fcStr ? (fcStr.length * 5.5 + 8) : 0;
            const tgtWidth = tgtStr ? 28 : 0;
            const totalW = Math.round(symWidth + 18 + fcWidth + tgtWidth);
            const totalH = 18;
            
            const gBadge = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gBadge.setAttribute("transform", `translate(${x}, ${y + 4})`);
            
            const pillRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            pillRect.setAttribute("x", "0");
            pillRect.setAttribute("y", "0");
            pillRect.setAttribute("width", totalW);
            pillRect.setAttribute("height", totalH);
            pillRect.setAttribute("rx", "5");
            pillRect.setAttribute("fill", "#ffffff");
            pillRect.setAttribute("stroke", pillStroke);
            pillRect.setAttribute("stroke-width", "1");
            gBadge.appendChild(pillRect);
            
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("x", "5");
            textEl.setAttribute("y", "12.5");
            textEl.setAttribute("fill", "#0f172a");
            textEl.setAttribute("font-size", "10px");
            textEl.setAttribute("font-weight", "800");
            textEl.setAttribute("font-family", "Inter, Pretendard, sans-serif");
            textEl.textContent = sym;
            gBadge.appendChild(textEl);
            
            const indRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            indRect.setAttribute("x", String(Math.round(symWidth + 6)));
            indRect.setAttribute("y", "4.5");
            indRect.setAttribute("width", "8.5");
            indRect.setAttribute("height", "8.5");
            indRect.setAttribute("rx", "2.5");
            indRect.setAttribute("fill", indFill);
            gBadge.appendChild(indRect);
            
            if (fcStr) {
                const fcTextEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                fcTextEl.setAttribute("x", String(Math.round(symWidth + 18)));
                fcTextEl.setAttribute("y", "12.5");
                fcTextEl.setAttribute("fill", isUp ? "#dc2626" : isDown ? "#4f46e5" : "#64748b");
                fcTextEl.setAttribute("font-size", "9px");
                fcTextEl.setAttribute("font-weight", "800");
                fcTextEl.setAttribute("font-family", "Inter, monospace");
                fcTextEl.textContent = fcStr;
                gBadge.appendChild(fcTextEl);
            }
            
            cloneOverlay.replaceChild(gBadge, fo);
        });
    }
    
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(cloneSvg);
    if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    
    const safeName = (currentMap.name || currentMapId).replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
    
    if (format === "svg") {
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}_pathway.svg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showGshToast("📐 벡터(SVG) 파일이 다운로드되었습니다 (논문/일러스트레이터 편집용).");
        return;
    }
    
    // High-resolution 3x PNG Export
    const scale = 3;
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = mapWidth * scale;
        canvas.height = mapHeight * scale;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, mapWidth, mapHeight);
        URL.revokeObjectURL(url);
        
        canvas.toBlob((pngBlob) => {
            if (!pngBlob) return;
            const pngUrl = URL.createObjectURL(pngBlob);
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = `${safeName}_pathway_3x.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(pngUrl);
            showGshToast("🖼️ 고해상도(3x) PNG 이미지가 성공적으로 저장되었습니다.");
        }, "image/png");
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("이미지 변환 중 오류가 발생했습니다. SVG 저장을 이용해 주세요.");
    };
    img.src = url;
}

// ----------------------------------------------------------------------
// 13. Network Mode Handler (STRING & TF Regulatory Network)
// ----------------------------------------------------------------------
function initIPTargetDiscoveryBindings() {
    safeAddListener("btn-net-mode-string", "click", () => {
        gNetworkMode = "string";
        const bString = document.getElementById("btn-net-mode-string");
        const bTf = document.getElementById("btn-net-mode-tf");
        if(bString) bString.classList.add("active");
        if(bTf) bTf.classList.remove("active");
        
        const titleEl = document.getElementById("network-tab-title");
        if(titleEl) titleEl.textContent = "STRING-DB 단백질 상호작용 네트워크";
        
        const controls = document.getElementById("string-controls-wrapper");
        if(controls) controls.style.display = "flex";
        
        const btnTfTab = document.getElementById("btn-subtab-tflist");
        if(btnTfTab) btnTfTab.style.display = "none";
        
        switchNetworkSubtab("node");
        renderNetworkGraph();
    });

    safeAddListener("btn-net-mode-tf", "click", () => {
        gNetworkMode = "tf";
        const bString = document.getElementById("btn-net-mode-string");
        const bTf = document.getElementById("btn-net-mode-tf");
        if(bString) bString.classList.remove("active");
        if(bTf) bTf.classList.add("active");
        
        const titleEl = document.getElementById("network-tab-title");
        if(titleEl) titleEl.textContent = "전사조절 (TF-Target) 네트워크 분석";
        
        const controls = document.getElementById("string-controls-wrapper");
        if(controls) controls.style.display = "none";
        
        const btnTfTab = document.getElementById("btn-subtab-tflist");
        if(btnTfTab) btnTfTab.style.display = "inline-block";
        
        switchNetworkSubtab("tf");
        renderNetworkGraph();
    });
}

function switchNetworkSubtab(subtab) {
    const btnNode = document.getElementById("btn-subtab-node");
    const btnTf = document.getElementById("btn-subtab-tflist");
    
    const divNode = document.getElementById("network-node-details");
    const divTf = document.getElementById("network-tf-list-container");
    
    [btnNode, btnTf].forEach(b => { if(b) { b.classList.remove("active"); b.style.color = "var(--text-muted)"; b.style.borderBottom = "none"; } });
    [divNode, divTf].forEach(d => { if(d) d.style.display = "none"; });
    
    if (subtab === "node" && btnNode) {
        btnNode.classList.add("active");
        btnNode.style.color = "var(--primary-color)";
        btnNode.style.borderBottom = "2px solid var(--primary-color)";
        divNode.style.display = "block";
    } else if (subtab === "tf" && btnTf) {
        btnTf.classList.add("active");
        btnTf.style.color = "var(--primary-color)";
        btnTf.style.borderBottom = "2px solid var(--primary-color)";
        divTf.style.display = "block";
    }
}

// ----------------------------------------------------------------------
// PCA (Principal Component Analysis) UI Logic
// ----------------------------------------------------------------------
function initPCAEvents() {
    const modeSelect = document.getElementById("pca-mode-select");
    if (modeSelect) {
        modeSelect.addEventListener("change", () => {
            const customContainer = document.getElementById("pca-custom-gene-container");
            if (customContainer) {
                customContainer.style.display = (modeSelect.value === "custom") ? "block" : "none";
            }
        });
    }

    const runBtn = document.getElementById("run-pca-btn");
    if (runBtn) {
        runBtn.addEventListener("click", () => {
            renderPCAPlot();
        });
    }

    // Export buttons
    safeAddListener("btn-export-pca-jpg", "click", () => {
        exportPlotlyChart("plotly-pca", "pca_plot", "jpeg");
    });
    safeAddListener("btn-export-pca-pdf", "click", () => {
        exportPlotlyChart("plotly-pca", "pca_plot", "pdf");
    });
}

function renderPCAPlot() {
    const chartDiv = document.getElementById("plotly-pca");
    const loadingDiv = document.getElementById("plotly-pca-loading");
    if (!chartDiv) return;

    if (!gGenes || gGenes.length === 0) {
        chartDiv.innerHTML = `<div class="text-center text-muted" style="padding-top: 150px;">RNA-seq 데이터를 업로드하시면 PCA 분석 차트가 표시됩니다.</div>`;
        if (loadingDiv) loadingDiv.innerHTML = "";
        return;
    }

    chartDiv.innerHTML = `<div style="text-align: center; padding-top: 150px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top: 10px;">PCA (주성분 분석) 연산 중...</p></div>`;
    if (loadingDiv) loadingDiv.innerHTML = `<div style="text-align: center; padding-top: 100px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;

    const modeSelect = document.getElementById("pca-mode-select");
    const mode = modeSelect ? modeSelect.value : "sample";
    
    let genes = [];
    if (mode === "custom") {
        const customText = document.getElementById("pca-custom-genes") ? document.getElementById("pca-custom-genes").value : "";
        genes = customText.split(/[\s,;\n]+/).map(s => s.trim()).filter(s => s.length > 0);
        if (genes.length === 0) {
            chartDiv.innerHTML = `<div class="text-center text-danger" style="padding-top: 150px;">분석할 유전자 이름을 1개 이상 입력해주세요.</div>`;
            if (loadingDiv) loadingDiv.innerHTML = "";
            return;
        }
    }

    fetch(`${API_URL}/api/pca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            session_id: gActiveSessionId,
            species: gCurrentSpecies,
            mode: mode,
            genes: genes
        })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) {
            chartDiv.innerHTML = `<div class="text-center text-danger" style="padding-top: 150px;">PCA 연산 실패: ${data.detail}</div>`;
            if (loadingDiv) loadingDiv.innerHTML = "";
            return;
        }

        const geneSamplePoints = data.gene_sample_points || [];
        const samples = data.samples || [];
        const pcaInfo = data.pca_info || {};
        const profiles = data.gene_profiles || [];
        const sampleNames = data.sample_names || [];

        // Clear loading spinner explicitly before rendering Plotly chart
        chartDiv.innerHTML = "";
        if (loadingDiv) loadingDiv.innerHTML = "";

        const palette = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#3b82f6', '#84cc16'];
        const traces = [];

        if (mode === "custom" && geneSamplePoints.length > 0) {
            // Option 2: Gene-level PCA points
            const genesMap = {};
            geneSamplePoints.forEach(p => {
                if (!genesMap[p.gene]) genesMap[p.gene] = [];
                genesMap[p.gene].push(p);
            });

            let colorIdx = 0;
            for (const [gName, pList] of Object.entries(genesMap)) {
                const geneColor = palette[colorIdx % palette.length];
                colorIdx++;

                const wtPts = pList.filter(pt => pt.group === "WT");
                const mutPts = pList.filter(pt => pt.group === "Mutant");

                if (wtPts.length > 0) {
                    traces.push({
                        x: wtPts.map(pt => pt.pc1),
                        y: wtPts.map(pt => pt.pc2),
                        text: wtPts.map(pt => `${pt.gene} (${pt.sample})`),
                        mode: 'markers+text',
                        type: 'scatter',
                        name: `${gName} [WT]`,
                        textposition: 'top center',
                        textfont: { family: 'Inter, sans-serif', size: 11, color: '#1e293b' },
                        marker: {
                            size: 14,
                            color: geneColor,
                            symbol: 'circle',
                            line: { color: '#0f172a', width: 1.5 }
                        },
                        customdata: wtPts,
                        hovertemplate: '<b>%{text}</b><br>샘플: %{customdata.sample}<br>발현량: %{customdata.expr}<br>PC1: %{x:.3f}<br>PC2: %{y:.3f}<extra></extra>'
                    });
                }

                if (mutPts.length > 0) {
                    traces.push({
                        x: mutPts.map(pt => pt.pc1),
                        y: mutPts.map(pt => pt.pc2),
                        text: mutPts.map(pt => `${pt.gene} (${pt.sample})`),
                        mode: 'markers+text',
                        type: 'scatter',
                        name: `${gName} [Mutant]`,
                        textposition: 'top center',
                        textfont: { family: 'Inter, sans-serif', size: 11, color: '#1e293b' },
                        marker: {
                            size: 15,
                            color: geneColor,
                            symbol: 'diamond',
                            line: { color: '#0f172a', width: 1.5 }
                        },
                        customdata: mutPts,
                        hovertemplate: '<b>%{text}</b><br>샘플: %{customdata.sample}<br>발현량: %{customdata.expr}<br>PC1: %{x:.3f}<br>PC2: %{y:.3f}<extra></extra>'
                    });
                }
            }
        } else {
            // Option 1: Whole-dataset Sample-level PCA (6 sample points)
            const wtSamples = samples.filter(s => s.group === "WT");
            const mutSamples = samples.filter(s => s.group === "Mutant");

            if (wtSamples.length > 0) {
                traces.push({
                    x: wtSamples.map(s => s.pc1),
                    y: wtSamples.map(s => s.pc2),
                    text: wtSamples.map(s => s.name),
                    mode: 'markers+text',
                    type: 'scatter',
                    name: 'WT (Wild Type)',
                    textposition: 'top center',
                    textfont: { family: 'Inter, sans-serif', size: 12, color: '#1e3a8a' },
                    marker: { size: 16, color: '#3b82f6', line: { color: '#1d4ed8', width: 2 } },
                    hovertemplate: '<b>%{text}</b><br>PC1: %{x:.3f}<br>PC2: %{y:.3f}<extra></extra>'
                });
            }
            if (mutSamples.length > 0) {
                traces.push({
                    x: mutSamples.map(s => s.pc1),
                    y: mutSamples.map(s => s.pc2),
                    text: mutSamples.map(s => s.name),
                    mode: 'markers+text',
                    type: 'scatter',
                    name: 'Mutant (변이주)',
                    textposition: 'top center',
                    textfont: { family: 'Inter, sans-serif', size: 12, color: '#831843' },
                    marker: { size: 16, color: '#ec4899', line: { color: '#be185d', width: 2 } },
                    hovertemplate: '<b>%{text}</b><br>PC1: %{x:.3f}<br>PC2: %{y:.3f}<extra></extra>'
                });
            }
        }

        const layout = {
            height: 500,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(248, 250, 252, 0.8)',
            font: { color: '#0f172a', family: 'Inter, sans-serif' },
            margin: { t: 40, r: 40, b: 60, l: 60 },
            xaxis: {
                title: `PC1 (${pcaInfo.pc1_var || 0}% Variance)`,
                zeroline: true,
                zerolinecolor: '#cbd5e1',
                zerolinewidth: 1.5,
                gridcolor: '#e2e8f0'
            },
            yaxis: {
                title: `PC2 (${pcaInfo.pc2_var || 0}% Variance)`,
                zeroline: true,
                zerolinecolor: '#cbd5e1',
                zerolinewidth: 1.5,
                gridcolor: '#e2e8f0'
            },
            legend: {
                orientation: 'h',
                y: 1.12,
                x: 0.5,
                xanchor: 'center'
            }
        };

        Plotly.newPlot('plotly-pca', traces, layout, { responsive: true });

        // Update PCA Title
        const titleEl = document.getElementById("pca-chart-title");
        if (titleEl) {
            if (mode === "custom") {
                const ptCount = geneSamplePoints.length;
                titleEl.innerHTML = `선택 유전자별 샘플 PCA 산점도 (${pcaInfo.gene_count || 0}개 유전자 × ${pcaInfo.sample_count || 0}개 샘플 = ${ptCount}개 데이터 포인트)`;
            } else {
                titleEl.innerHTML = `전체 데이터셋 샘플간 PCA 산점도 (${pcaInfo.sample_count || 0}개 샘플 데이터 포인트)`;
            }
        }

        // Render Individual Gene Expression Profiles Grouped Bar Chart (only in Custom mode)
        const loadingCard = document.getElementById("pca-loading-card");
        if (mode === "custom" && loadingDiv && profiles.length > 0) {
            if (loadingCard) loadingCard.style.display = "block";
            const profileTraces = profiles.map((p, idx) => {
                const yVals = sampleNames.map(sName => p.sample_values[sName] || 0.0);
                return {
                    x: sampleNames,
                    y: yVals,
                    name: `${p.gene} (Log2FC: ${p.log2fc >= 0 ? '+' : ''}${p.log2fc})`,
                    type: 'bar',
                    marker: {
                        color: palette[idx % palette.length]
                    },
                    hovertemplate: `<b>유전자: ${p.gene}</b> (%{x})<br>발현량: %{y:.2f}<br>Log2FC: ${p.log2fc}<extra></extra>`
                };
            });

            const profileLayout = {
                height: 320,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#0f172a', family: 'Inter, sans-serif' },
                margin: { t: 30, r: 20, b: 60, l: 60 },
                barmode: 'group',
                xaxis: { title: '샘플 (Samples)', tickangle: 0 },
                yaxis: { title: '유전자 발현량 (Expression Level)', zeroline: true, zerolinecolor: '#cbd5e1' },
                legend: {
                    orientation: 'h',
                    y: 1.15,
                    x: 0.5,
                    xanchor: 'center'
                }
            };

            Plotly.newPlot('plotly-pca-loading', profileTraces, profileLayout, { responsive: true });
        } else {
            if (loadingCard) loadingCard.style.display = "none";
        }
    })
    .catch(err => {
        if (chartDiv) chartDiv.innerHTML = `<div class="text-center text-danger" style="padding-top: 150px;">PCA 연산 중 오류 발생: ${err.message}</div>`;
        if (loadingDiv) loadingDiv.innerHTML = "";
    });
}

// ==========================================
// One-Click Publication Report Generator Handler
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const btnGenReport = document.getElementById("btn-generate-report");
    if (btnGenReport) {
        btnGenReport.addEventListener("click", async () => {
            const curSpecies = (typeof gCurrentSpecies !== 'undefined') ? gCurrentSpecies : "sce";
            const curSession = (typeof gActiveSessionId !== 'undefined' && gActiveSessionId) ? gActiveSessionId : "default";
            const fcEl = document.getElementById("fc-cutoff");
            const fdrEl = document.getElementById("fdr-cutoff");
            const log2fcVal = fcEl ? parseFloat(fcEl.value || 1.0) : 1.0;
            const fdrVal = fdrEl ? parseFloat(fdrEl.value || 0.05) : 0.05;

            // Capture Volcano Plot image if present
            let volcanoImg = "";
            const volcanoDiv = document.getElementById("volcano-plot");
            if (volcanoDiv && volcanoDiv.data) {
                try {
                    volcanoImg = await Plotly.toImage('volcano-plot', { format: 'png', width: 900, height: 450 });
                } catch (e) {
                    console.warn("Plotly image capture warning:", e);
                }
            }

            btnGenReport.disabled = true;
            btnGenReport.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 보고서 생성 중...`;

            fetch(`${API_URL}/api/generate_report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: curSession,
                    species: curSpecies,
                    log2fc_cutoff: log2fcVal,
                    fdr_cutoff: fdrVal,
                    volcano_img: volcanoImg
                })
            })
            .then(r => {
                if (!r.ok) throw new Error("보고서 생성 실패");
                return r.text();
            })
            .then(htmlContent => {
                btnGenReport.disabled = false;
                btnGenReport.innerHTML = `<i class="fa-solid fa-file-contract"></i> 📄 종합 보고서 생성`;
                
                const reportWindow = window.open("", "_blank");
                if (reportWindow) {
                    reportWindow.document.write(htmlContent);
                    reportWindow.document.close();
                } else {
                    alert("팝업 창이 블록되었습니다. 브라우저의 팝업 허용 설정을 확인해 주세요.");
                }
            })
            .catch(err => {
                btnGenReport.disabled = false;
                btnGenReport.innerHTML = `<i class="fa-solid fa-file-contract"></i> 📄 종합 보고서 생성`;
                alert("종합 보고서 생성 중 오류가 발생했습니다: " + err.message);
            });
        });
    }

    // Initialize Sample Group Mapping Modal handlers
    const modalMapping = document.getElementById("sample-mapping-modal");
    const closeBtnMapping = document.getElementById("close-sample-mapping-modal");
    const cancelBtnMapping = document.getElementById("btn-cancel-mapping");
    const confirmBtnMapping = document.getElementById("btn-confirm-mapping");

    if (closeBtnMapping && modalMapping) {
        closeBtnMapping.addEventListener("click", () => {
            modalMapping.style.display = "none";
        });
    }
    if (cancelBtnMapping && modalMapping) {
        cancelBtnMapping.addEventListener("click", () => {
            modalMapping.style.display = "none";
        });
    }
    if (confirmBtnMapping && modalMapping) {
        confirmBtnMapping.addEventListener("click", () => {
            const ctrlName = document.getElementById("mapping-control-name").value.trim() || "Control";
            const treatName = document.getElementById("mapping-treated-name").value.trim() || "Treated";

            const ctrlCheckboxes = document.querySelectorAll("#mapping-control-columns input[type='checkbox']:checked");
            const treatCheckboxes = document.querySelectorAll("#mapping-treated-columns input[type='checkbox']:checked");

            const ctrlCols = Array.from(ctrlCheckboxes).map(cb => cb.value);
            const treatCols = Array.from(treatCheckboxes).map(cb => cb.value);

            if (ctrlCols.length === 0 || treatCols.length === 0) {
                alert("대조군과 실험군 각각 최소 1개 이상의 샘플 열을 선택해야 합니다.");
                return;
            }

            modalMapping.style.display = "none";

            // If raw text data is available, re-run with new mapping
            const rawText = getGridTextContent();
            if (rawText && rawText.trim().length > 0) {
                updateStatus("analyzing", "사용자 정의 샘플 매핑으로 재분석 중...");
                fetch(`${API_URL}/api/upload_text`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: rawText,
                        species: gCurrentSpecies,
                        control_cols: ctrlCols,
                        treated_cols: treatCols,
                        control_name: ctrlName,
                        treated_name: treatName
                    })
                })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        processUploadedData(data);
                    } else {
                        alert("분석 실패: " + (data.detail || "오류 발생"));
                        updateStatus("ready", "대기 중");
                    }
                })
                .catch(err => {
                    alert("오류: " + err.message);
                    updateStatus("ready", "대기 중");
                });
            } else {
                // If just updating metadata in memory
                window.gSampleMetadata = {
                    control_name: ctrlName,
                    treated_name: treatName,
                    control_cols: ctrlCols,
                    treated_cols: treatCols,
                    sample_names: [...ctrlCols, ...treatCols]
                };
                finalizeDataLoading();
            }
        });
    }
});

