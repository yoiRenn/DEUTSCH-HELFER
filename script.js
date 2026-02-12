// --- 常量 ---
const TYPE_MAP = {
    'n': '名词 (Nomen)', 'v': '动词 (Verb)', 'adj': '形容词 (Adjektiv)',
    'adv': '副词 (Adverb)', 'prep': '介词 (Präposition)', 'pron': '代词 (Pronomen)',
    'conj': '连词 (Konjunktion)', 'num': '数词 (Numerale)', 'art': '冠词 (Artikel)'
};

// --- 状态 ---
let configData = {};
let activeList = [];
let playList = [];

let currentMode = 'spelling';
let currentOrder = 'random';
let gameState = 'waiting_answer';
let currentWord = null;
let currentIndex = 0;

let ignoredSet = new Set();
let favoriteSet = new Set(); // 新增：收藏集合

let wrongList = [];     // 新增：本轮错题记录
let isReviewMode = false; // 新增：标记当前是否在复习错题模式

let userStats = { total: 0, errors: 0, confusingPairs: {} }; // 统计数据
let wordWeights = {}; // 单词权重表 { wordId: 5.0 }
// --- DOM ---
const els = {
    count: document.getElementById('word-count'),
    bookshelf: document.getElementById('bookshelf'),
    sidebarStats: document.getElementById('sidebar-stats'),
    qUnit: document.getElementById('q-unit'),
    qMain: document.getElementById('q-main'),
    qSub: document.getElementById('q-sub'),
    qTag: document.getElementById('q-tag'),
    uiGender: document.getElementById('ui-gender-btns'),
    // 👇 新增这三个 👇
    uiPlural: document.getElementById('ui-plural-box'),
    inputSingular: document.getElementById('input-singular'),
    inputPlural: document.getElementById('input-plural'),
    // ----------------

    uiInput: document.getElementById('ui-input-box'),
    uiInput: document.getElementById('ui-input-box'),
    inputFull: document.getElementById('input-full'),
    result: document.getElementById('result-msg'),
    infoArea: document.getElementById('info-area'),
    infoForms: document.getElementById('info-forms'),
    infoExample: document.getElementById('info-example'),
    btnSubmit: document.getElementById('btn-submit'),
    btnNext: document.getElementById('btn-next'),
    btnModeGender: document.getElementById('btn-mode-gender'),
    btnModeSpelling: document.getElementById('btn-mode-spelling'),
    btnModePlural: document.getElementById('btn-mode-plural'),
    btnModeCase: document.getElementById('btn-mode-case'),
    btnIgnore: document.getElementById('btn-ignore'),
    btnFav: document.getElementById('btn-fav') // 新增
};
// --- 强力聚焦助手 (专治 EXE/App 输入框卡死) ---
// --- 窗口唤醒与强力聚焦助手 ---
// --- 终极聚焦助手 (Fix: 解决回车后输入框不聚焦) ---
function forceFocus(el) {
    if (!el) return;

    // 1. 强制唤醒当前窗口 (解决 Electron 窗口失焦)
    if (window.top) window.top.focus();
    window.focus();

    // 2. 立即尝试聚焦 (第一重保险)
    el.focus();

    // 3. 延时再次聚焦 (第二重保险，等待 DOM 渲染完毕)
    // 使用 requestAnimationFrame 确保在浏览器下一帧绘制后执行
    requestAnimationFrame(() => {
        setTimeout(() => {
            el.focus();
            el.click(); // 模拟点击，唤醒光标
        }, 100);
    });
}
// --- 自定义弹窗系统 (带防误触安全锁) ---
let modalPrimaryCallback = null;
let modalSecondaryCallback = null;
let isModalReady = false; // 🛑 新增：安全锁状态

// 参数：消息, 主按钮文字, 主回调, 副按钮文字(可选), 副回调(可选)
function showModal(msg, btn1Text, callback1, btn2Text = null, callback2 = null) {
    const overlay = document.getElementById('modal-overlay');
    const msgDiv = document.getElementById('modal-msg');
    const btn1 = document.getElementById('modal-btn-primary');
    const btn2 = document.getElementById('modal-btn-secondary');

    // 1. 初始化安全锁：刚弹出时锁住，不许按回车
    isModalReady = false;

    msgDiv.innerHTML = msg;

    // 设置主按钮
    btn1.innerText = btn1Text;
    modalPrimaryCallback = callback1;

    // 设置副按钮
    if (btn2Text) {
        btn2.style.display = 'block';
        btn2.innerText = btn2Text;
        modalSecondaryCallback = callback2;
    } else {
        btn2.style.display = 'none';
        modalSecondaryCallback = null;
    }

    overlay.style.display = 'flex';

    // 2. 延迟解锁 + 延迟聚焦
    // 等 400ms 后才允许键盘操作，防止上一题的回车误触
    setTimeout(() => {
        isModalReady = true; // 解锁
        btn1.focus();    // 聚焦主按钮
    }, 400);
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    isModalReady = false; // 关闭后重置锁
}

function onModalPrimaryClick() {
    // 如果是鼠标点击，不需要检查 isModalReady，直接响应
    closeModal();
    if (modalPrimaryCallback) modalPrimaryCallback();
}

function onModalSecondaryClick() {
    closeModal();
    if (modalSecondaryCallback) modalSecondaryCallback();
}

// 监听弹窗回车
document.addEventListener('keydown', e => {
    const overlay = document.getElementById('modal-overlay');

    // 只有弹窗显示 && 且按了回车
    if (overlay.style.display === 'flex' && e.key === 'Enter') {
        // 🛑 核心修复：如果安全锁还没解开，就无视这个回车！
        if (!isModalReady) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        onModalPrimaryClick();
    }
});
// --- 7. 智能核心算法 (AI Core) ---

// 算法 A: 莱文斯坦距离 + 错误回溯分析
function analyzeError(target, input) {
    const m = target.length;
    const n = input.length;
    // dp[i][j] 存储距离
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = target[i - 1] === input[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,       // 删除
                dp[i][j - 1] + 1,       // 插入
                dp[i - 1][j - 1] + cost // 替换
            );
        }
    }

    // 回溯找出具体的错误类型 (Confusion Matrix)
    let i = m, j = n;
    const feedback = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && target[i - 1] === input[j - 1]) {
            i--; j--; // 匹配，无操作
        } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
            // 发现替换错误 (这是最有价值的统计)
            const expected = target[i - 1];
            const actual = input[j - 1];
            recordConfusion(expected, actual); // 记录到统计
            i--; j--;
        } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
            i--; // 删除 (漏写了)
        } else {
            j--; // 插入 (多写了)
        }
    }
}

// 记录混淆对 (比如把 v 写成 f)
function recordConfusion(exp, act) {
    const key = `${exp} → ${act}`;
    userStats.confusingPairs[key] = (userStats.confusingPairs[key] || 0) + 1;
    saveStats();
}

// 算法 B: 更新单词权重 (Smart Weights)
function updateWeight(wordId, isCorrect) {
    let w = wordWeights[wordId] || 1.0; // 默认权重 1.0

    if (isCorrect) {
        w = w * 0.8; // 答对，权重打八折 (逐渐降低出现频率)
        if (w < 0.5) w = 0.5; // 最低权重
    } else {
        w = w + 5.0; // 答错，权重激增 (变成“显眼包”)
        if (w > 20) w = 20; // 封顶
    }

    wordWeights[wordId] = w;
    localStorage.setItem('dv_weights', JSON.stringify(wordWeights));
}

function saveStats() {
    localStorage.setItem('dv_stats', JSON.stringify(userStats));
}

// 算法 C: 加权随机抽样 (Weighted Random)
// 代替原来的简单 Math.random
function getWeightedRandomList(list) {
    // 1. 给每个词附上权重
    let pool = list.map(item => {
        return { item: item, weight: wordWeights[item.id] || 1.0 };
    });

    // 2. 简单的洗牌逻辑：权重越大的词，在排序时被视为“拥有更大的随机数”
    // 这里使用一种变种的随机排序：Score = Math.random() ^ (1 / Weight)
    // 权重越高，Score 越大，越容易排在前面
    pool.sort((a, b) => {
        let scoreA = Math.pow(Math.random(), 1 / a.weight);
        let scoreB = Math.pow(Math.random(), 1 / b.weight);
        return scoreB - scoreA; // 降序，分高的在前
    });

    return pool.map(p => p.item);
}

// --- 1. 初始化 ---
initApp();

function initApp() {
    loadBasicSettings();
    fetch('data/config.json')
        .then(res => res.json())
        .then(data => {
            configData = data;
            renderSidebar();
            if (restoreSidebarSelection()) {
                loadSelectedUnits(true);
            } else {
                els.count.textContent = "请打开侧边栏选择单元";
                toggleSidebar();
            }
        })
        .catch(err => {
            console.error(err);
            els.count.textContent = "配置加载失败";
        });
    // 加载权重与统计
    const savedWeights = localStorage.getItem('dv_weights');
    if (savedWeights) wordWeights = JSON.parse(savedWeights);

    const savedStats = localStorage.getItem('dv_stats');
    if (savedStats) userStats = JSON.parse(savedStats);
}

// --- 2. 存储逻辑 ---
function loadBasicSettings() {
    const savedIgnored = localStorage.getItem('dv_ignored');
    if (savedIgnored) ignoredSet = new Set(JSON.parse(savedIgnored));

    // 加载收藏
    const savedFav = localStorage.getItem('dv_favorites');
    if (savedFav) favoriteSet = new Set(JSON.parse(savedFav));

    const savedSettings = localStorage.getItem('dv_settings');
    if (savedSettings) {
        const s = JSON.parse(savedSettings);
        currentMode = s.mode || 'spelling';
        currentOrder = s.order || 'random';
        changeMode(currentMode, false);
        document.getElementsByName('order').forEach(r => {
            if (r.value === currentOrder) r.checked = true;
        });
    }
}

function saveState() {
    const settings = { mode: currentMode, order: currentOrder, index: currentIndex };
    localStorage.setItem('dv_settings', JSON.stringify(settings));

    const checkboxes = document.querySelectorAll('#bookshelf input:checked');
    const values = Array.from(checkboxes).map(cb => cb.value);
    localStorage.setItem('dv_selection', JSON.stringify(values));
}

function saveIgnored() { localStorage.setItem('dv_ignored', JSON.stringify([...ignoredSet])); }
function saveFavorites() { localStorage.setItem('dv_favorites', JSON.stringify([...favoriteSet])); }

function renderSidebar() {
    // 1. 清空书架容器 (这部分将作为中间的可滚动区域)
    els.bookshelf.innerHTML = "";

    // --- A. 顶部工具栏 (备份 & 导入) ---
    const backupDiv = document.createElement('div');
    backupDiv.style.cssText = "display:flex; gap:10px; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:10px;";

    // 导出按钮
    const btnExport = document.createElement('button');
    btnExport.innerText = "💾 保存参数";
    btnExport.className = "small-btn";
    btnExport.style.flex = "1";
    btnExport.style.background = "#28a745";
    btnExport.onclick = exportData;

    // 导入按钮
    const btnImport = document.createElement('button');
    btnImport.innerText = "📂 读取参数";
    btnImport.className = "small-btn";
    btnImport.style.flex = "1";
    btnImport.style.background = "#17a2b8";
    btnImport.onclick = triggerImport;

    // 隐藏的文件输入框
    const fileInput = document.createElement('input');
    fileInput.type = "file";
    fileInput.id = "file-input";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    fileInput.onchange = importData;

    backupDiv.appendChild(btnExport);
    backupDiv.appendChild(btnImport);
    backupDiv.appendChild(fileInput);
    els.bookshelf.appendChild(backupDiv); // 加入到滚动区域顶部

    // --- B. 统计入口 ---
    const statsBtn = document.createElement('div');
    statsBtn.innerHTML = `<button onclick="showStatsDashboard()" style="width:100%; padding:10px; background:#6c757d; color:white; border:none; border-radius:6px; margin-bottom:15px; cursor:pointer;">📊 查看我的学习分析</button>`;
    els.bookshelf.appendChild(statsBtn);

    // --- C. 收藏本入口 ---
    const favDiv = document.createElement('div');
    favDiv.innerHTML = `<label class="special-item" style="display:block; padding:10px; cursor:pointer;">
        <input type="checkbox" value="FAVORITES_ALL"> ❤️ 我的收藏本
    </label>`;
    els.bookshelf.appendChild(favDiv);

    // --- D. 渲染普通书架 (循环) ---
    for (const [bookName, files] of Object.entries(configData)) {
        const bookDiv = document.createElement('div');
        bookDiv.className = 'book-group';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'book-title';
        titleDiv.innerHTML = `<span>📂 ${bookName}</span> <span>⬇</span>`;
        titleDiv.onclick = () => { bookDiv.querySelector('.unit-list').classList.toggle('show'); };

        const listDiv = document.createElement('div');
        listDiv.className = 'unit-list';

        files.forEach(fileName => {
            const displayName = fileName.replace('.csv', '');
            const fileInfo = JSON.stringify({ book: bookName, file: fileName, name: displayName });
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value='${fileInfo}'> ${displayName}`;
            listDiv.appendChild(label);
        });

        bookDiv.appendChild(titleDiv);
        bookDiv.appendChild(listDiv);
        els.bookshelf.appendChild(bookDiv);
    }

    // --- E. 底部固定区域 (垃圾桶) ---
    // 👇👇👇 这里的代码是关键！它负责把垃圾桶放到最下面 👇👇👇

    // 获取侧边栏底部的 footer 容器
    let footer = document.querySelector('.sidebar-footer');

    // 容错：如果 HTML 里误删了 footer，自动补一个
    if (!footer) {
        footer = document.createElement('div');
        footer.className = 'sidebar-footer';
        document.getElementById('sidebar').appendChild(footer);
    }

    // 清空 footer，重新渲染垃圾桶按钮
    footer.innerHTML = "";

    const dataSection = document.createElement('div');
    // margin-top: auto 配合 flex 布局，确保它沉底
    dataSection.style.cssText = "padding-top: 15px; border-top: 1px dashed #ddd; margin-top: auto;";

    dataSection.innerHTML = `
        <h3 style="margin:0 0 10px 0; font-size:14px; color:#666;">数据管理</h3>
        <button class="reset-btn" onclick="showTrashCan()" style="border-color:#666; color:#333; width:100%;">
            🗑️ 打开垃圾桶
        </button>
        `;

    footer.appendChild(dataSection);
}

function restoreSidebarSelection() {
    const savedSelection = localStorage.getItem('dv_selection');
    if (!savedSelection) return false;
    const checkedValues = JSON.parse(savedSelection);
    const inputs = document.querySelectorAll('#bookshelf input');
    let hasChecked = false;
    inputs.forEach(input => {
        if (checkedValues.includes(input.value)) {
            input.checked = true;
            hasChecked = true;
        }
    });
    return hasChecked;
}

// 【关键修改】加载逻辑
async function loadSelectedUnits(isRestore = false) {
    const checkboxes = document.querySelectorAll('#bookshelf input:checked');
    if (checkboxes.length === 0) {
        if (!isRestore) alert("请至少选择一个单元！");
        return;
    }

    // 检查是否勾选了“我的收藏”
    let isFavMode = false;
    checkboxes.forEach(cb => {
        if (cb.value === "FAVORITES_ALL") isFavMode = true;
    });

    els.sidebarStats.textContent = isFavMode ? "正在搜索收藏..." : "正在读取...";
    let tempAllWords = [];
    let promises = [];

    if (isFavMode) {
        // 如果选了收藏，我们要扫描所有 config 里的文件，因为我们不知道收藏的词在哪本书里
        // 为了方便，这里直接加载所有书（对于文本文件来说速度很快）
        // 如果你只想加载勾选的书里的收藏，逻辑会不同。这里实现的是“查看所有收藏”
        for (const [bookName, files] of Object.entries(configData)) {
            files.forEach(fileName => {
                const displayName = fileName.replace('.csv', '');
                const info = { book: bookName, file: fileName, name: displayName };
                promises.push(fetchCsv(info));
            });
        }
    } else {
        // 正常模式：只加载勾选的文件
        checkboxes.forEach(cb => {
            if (cb.value !== "FAVORITES_ALL") {
                const info = JSON.parse(cb.value);
                promises.push(fetchCsv(info));
            }
        });
    }

    const results = await Promise.all(promises);
    results.forEach(w => tempAllWords = tempAllWords.concat(w));

    // 如果是收藏模式，这里进行过滤，只保留在 favoriteSet 里的
    if (isFavMode) {
        tempAllWords = tempAllWords.filter(w => favoriteSet.has(w.id));
        if (tempAllWords.length === 0) {
            alert("你还没有收藏任何单词！");
            return;
        }
    }

    activeList = tempAllWords;
    els.sidebarStats.textContent = `已加载 ${activeList.length} 词`;
    isReviewMode = false;

    // 如果不是恢复状态，清空错题
    if (!isRestore) wrongList = [];

    activeList = tempAllWords;
    els.sidebarStats.textContent = `已加载 ${activeList.length} 词`;

    refreshPlayList(isRestore);
    if (!isRestore) toggleSidebar();

    refreshPlayList(isRestore);
    if (!isRestore) toggleSidebar();
}

// 辅助：读取单个CSV
// 辅助：读取单个CSV (智能兼容新旧格式)
async function fetchCsv(info) {
    // 1. 路径兼容：如果是"专项训练"，假设文件可能在根目录 data/ 下，或者 data/专项训练/ 下
    // 为了保险，建议你把 All_Verbs_Training.csv 新建一个文件夹叫 "专项训练" 放进去
    const path = `data/${info.book}/${info.file}`;

    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error("404");

        const text = await res.text();
        const lines = text.trim().split('\n');
        const words = [];

        for (let i = 1; i < lines.length; i++) { // 跳过表头
            if (!lines[i].trim()) continue;

            // 处理 CSV 里的逗号 (假如 csv 里有 "a,b" 这种引号包裹的情况，简单的 split(',') 会错)
            // 但为了兼容你现有数据，暂且保持 split(',')，如果有复杂数据建议用库
            const row = lines[i].split(',');

            // 🤖 智能列对齐
            // 新 CSV (8列): id, type, gender, word, cn, forms, example, source
            // 旧 CSV (6列): type, gender, word, cn, forms, example

            let type, gender, word, cn, forms, example;

            // 如果第一列是数字 (ID)，说明是新格式
            if (!isNaN(parseInt(row[0]))) {
                type = row[1];
                gender = row[2];
                word = row[3];
                cn = row[4];
                forms = row[5];
                example = row[6];
            } else {
                // 旧格式
                type = row[0];
                gender = row[1];
                word = row[2];
                cn = row[3];
                forms = row[4];
                example = row[5];
            }

            const uniqueId = `${info.book}-${info.name}-${word ? word.trim() : i}`;

            if (word) {
                words.push({
                    id: uniqueId,
                    unit: info.name,
                    type: type ? type.trim() : "",
                    gender: gender ? gender.trim() : "",
                    word: word.trim(),
                    cn: cn ? cn.trim() : "",
                    forms: forms ? forms.trim() : "",
                    example: example ? example.trim() : ""
                });
            }
        }
        return words;
    } catch (err) {
        console.error(`读取失败: ${path}`, err);
        return [];
    }
}
// --- 4. 刷新与播放 ---
// --- 4. 刷新与播放 (带模式过滤) ---
// --- 4. 刷新与播放 (最终去重版) ---
// --- 4. 刷新与播放 (数据隔离终极版) ---
function refreshPlayList(isRestore = false) {
    if (!isReviewMode) {
        let filtered = activeList.filter(w => {
            const notIgnored = !ignoredSet.has(w.id);

            // 判断该词是否来自“专项训练”文件
            // (请确保 config.json 里对应的文件名是这个)
            const isSpecialFile = w.unit === 'All_Verbs_Training';

            let typeMatch = true;

            // --- 🚫 数据隔离逻辑 ---

            if (currentMode === 'case') {
                // 【格位模式】：只允许“专项文件”里的“动词”进入
                // 1. 必须来自 All_Verbs_Training
                // 2. 必须是动词 (且不是副词)
                const t = w.type ? w.type.toLowerCase() : "";
                const isVerb = t.includes('v') && !t.includes('adv');

                typeMatch = isSpecialFile && isVerb;
            }
            else if (currentMode === 'plural') {
                // 【复数模式】：只允许“普通单元”里的“名词”进入
                // 1. 必须 不是 专项文件
                // 2. 必须是 名词
                const isNoun = w.type && w.type.toLowerCase().includes('n');

                typeMatch = !isSpecialFile && isNoun;
            }
            else {
                // 【拼写模式】：只允许“普通单元”进入
                // 彻底屏蔽专项文件，防止出现重复的动词
                typeMatch = !isSpecialFile;
            }

            return notIgnored && typeMatch;
        });

        // 提示逻辑：防止用户切到某个模式发现全是空的
        if (filtered.length === 0 && activeList.length > 0) {
            // 比如：在拼写模式下，只勾选了专项训练文件 -> 结果为空
            // 这里可以静默，或者 console.log 调试
            console.log("当前模式下列表为空 (可能是因为数据隔离策略)");
        }

        if (!isRestore) wrongList = [];

        if (currentOrder === 'random') {
            playList = getWeightedRandomList(filtered);
        } else {
            playList = [...filtered];
        }
    }

    if (isRestore) {
        const savedSettings = localStorage.getItem('dv_settings');
        if (savedSettings) {
            const s = JSON.parse(savedSettings);
            currentIndex = (s.index && s.index < playList.length) ? s.index : 0;
        }
    } else {
        currentIndex = 0;
    }

    updateCountDisplay();
    saveState();

    gameState = 'waiting_answer';
    nextQuestion();
}
// 辅助：更新顶部剩余数量/错题数量显示
function updateCountDisplay() {
    const modeText = isReviewMode ? "【复习错题】" : "";
    els.count.textContent = `${modeText} 进度: ${currentIndex}/${playList.length} | 错题: ${wrongList.length}`;
}

// --- 辅助：解析动词格位标记 ---
function parseVerbCase(rawWord) {
    // 匹配 <...> 里的内容
    const matches = rawWord.match(/<[^>]+>/g);

    if (matches) {
        // 提取标签，去掉尖括号，转大写
        let targetCase = matches.join('').replace(/</g, '').replace(/>/g, '').toUpperCase();
        // 提取纯单词 (把标签删掉)
        const cleanWord = rawWord.replace(/<[^>]+>/g, '').trim();
        return { cleanWord, targetCase };
    }
    return { cleanWord: rawWord, targetCase: null };
}

// --- 5. 出题 ---
// --- 5. 出题逻辑 (拆分为：下一题计算 + 界面渲染) ---

// 仅负责索引递增
function nextQuestion() {
    // 1. 列表为空检查
    if (playList.length === 0) {
        els.qMain.textContent = "列表为空";
        els.qSub.textContent = "请检查模式或单元";
        els.btnSubmit.style.display = 'none';
        els.btnNext.style.display = 'none';
        return;
    }

    // 2. 检查一轮结束
    if (currentIndex >= playList.length) {
        handleRoundFinished();
        return;
    }

    // 3. 切换到下一题
    currentWord = playList[currentIndex];
    currentIndex++; // 索引 +1

    saveState();
    updateCountDisplay();
    updateBtnStates();

    gameState = 'waiting_answer'; // 重置状态
    renderCurrentQuestion();      // 调用渲染
}

// 仅负责画界面 (切模式时只调这个，不调 nextQuestion)
// 仅负责画界面
function renderCurrentQuestion() {
    if (!currentWord) return;

    // 1. 【关键】先把焦点从当前的按钮（下一题）移开
    // 防止隐藏按钮时，浏览器把焦点丢回 body
    if (document.activeElement) document.activeElement.blur();

    // 2. 重置所有 UI 元素
    els.result.innerHTML = "";
    els.result.className = "result";
    els.infoArea.style.display = 'none';

    // 强制隐藏所有输入区
    els.uiInput.style.display = 'none';
    els.uiPlural.style.display = 'none';
    els.uiGender.style.display = 'none';
    const caseBox = document.getElementById('ui-case-selector');
    if (caseBox) caseBox.style.display = 'none';

    // 强制隐藏按钮
    els.btnSubmit.style.display = 'none';
    els.btnNext.style.display = 'none';

    // 3. 清空输入框值
    els.inputFull.value = "";
    if (els.inputSingular) els.inputSingular.value = "";
    if (els.inputPlural) els.inputPlural.value = "";

    // 4. 填充基础信息
    els.qUnit.textContent = currentWord.unit;
    const verbInfo = parseVerbCase(currentWord.word);

    // --- 🎯 模式分流渲染 ---

    // 【模式 C】动词格位模式
    if (currentMode === 'case' && verbInfo.targetCase) {
        els.qMain.textContent = currentWord.cn;
        els.qSub.textContent = verbInfo.cleanWord;
        els.qTag.textContent = "动词搭配";

        if (caseBox) caseBox.style.display = 'flex';
        // 这种模式下是点击按钮，不需要聚焦输入框
    }
    // 【模式 B】复数模式
    else if (currentMode === 'plural') {
        els.qMain.textContent = currentWord.cn;
        els.qSub.textContent = "";
        els.qTag.textContent = TYPE_MAP[currentWord.type] || currentWord.type;

        els.uiPlural.style.display = 'flex';
        els.inputSingular.placeholder = "单数 (冠词 + 单词)";
        els.inputPlural.placeholder = "复数 (仅单词)";

        // 👇👇👇 确保这里用了 forceFocus
        forceFocus(els.inputSingular);
    }
    // 【模式 A】拼写模式 (默认)
    else {
        els.qMain.textContent = currentWord.cn;
        els.qSub.textContent = "";
        els.qTag.textContent = TYPE_MAP[currentWord.type] || currentWord.type;

        els.uiInput.style.display = 'block';
        els.inputFull.placeholder = "请输入答案...";

        // 显示提交按钮
        els.btnSubmit.style.display = 'inline-block';

        // 👇👇👇 确保这里用了 forceFocus
        forceFocus(els.inputFull);
    }
}
// --- 处理一轮结束 ---
// --- 处理一轮结束 ---
function handleRoundFinished() {
    // 场景 A: 有错题 -> 提供“重练”选项
    if (wrongList.length > 0) {
        showModal(
            `本轮结束！<br>你做错了 <strong style="color:#e03131; font-size:24px;">${wrongList.length}</strong> 个单词。<br>要攻克它们吗？`,

            "💪 错题重练", // 按钮1：重练
            () => {
                // 1. 把错题变成新的播放列表
                // 使用 spread operator [...] 复制一份，防止引用问题
                playList = [...wrongList];

                // 2. 【关键】清空错题本
                // (因为在新的“错题重练轮”里，如果你又错了，要重新加入 wrongList)
                wrongList = [];

                // 3. 重置索引和状态
                currentIndex = 0;

                // 4. 随机化一下，避免背顺序
                shuffle(playList);

                alertUser("进入错题突击模式！加油！"); // 界面上方给个小提示(可选)
                nextQuestion();
            },

            "🔄 全部重来", // 按钮2：放弃错题，重开一局
            () => {
                startNewRoundFull(); // 调用完整的重开逻辑
            }
        );
    }
    // 场景 B: 全对 -> 直接重开
    else {
        showModal(
            "🎉 太棒了！本轮全对！<br>简直是德语天才！",
            "开启新一轮",
            () => {
                startNewRoundFull();
            }
        );
    }
}

// --- 辅助函数：开启全新的一轮 ---
function startNewRoundFull() {
    // 1. 【关键】清空错题本
    wrongList = [];

    // 2. 重新加载筛选后的单词
    // (这就相当于点了一下侧边栏的刷新按钮，恢复所有选中的词)
    refreshPlayList(false);

    // 3. 根据设置决定是否乱序
    const orderVal = document.querySelector('input[name="order"]:checked').value;
    if (orderVal === 'random') {
        shuffle(playList);
    }

    currentIndex = 0;
    nextQuestion();
}

// 简单的顶部提示 (可选，替代 alert)
function alertUser(msg) {
    els.result.innerHTML = msg;
    els.result.className = "result";
}

// --- 6. 交互 (收藏 & 斩) ---
function toggleFav() {
    if (!currentWord) return;
    if (favoriteSet.has(currentWord.id)) {
        favoriteSet.delete(currentWord.id);
    } else {
        favoriteSet.add(currentWord.id);
    }
    saveFavorites();
    updateBtnStates();
}

// --- 修改后的斩词逻辑 ---
function toggleIgnore() {
    if (!currentWord) return;

    // 如果已经在垃圾桶里（理论上不会发生，因为界面上按钮会变），则是撤销
    if (ignoredSet.has(currentWord.id)) {
        ignoredSet.delete(currentWord.id);
        alert("已撤销斩杀"); // 很少用到，因为点斩就跳走了
    } else {
        // 核心动作：加入黑名单
        ignoredSet.add(currentWord.id);
        saveIgnored();

        // 视觉反馈 + 自动下一题
        // 这里的体验优化：不弹窗，直接移除出当前队列，并切换下一题
        // 为了平滑，我们可以从 playList 中移除当前项（如果还没轮完）

        // 1. 从当前播放列表移除，防止等会儿又随机到它
        playList = playList.filter(w => w.id !== currentWord.id);

        // 2. 更新界面统计
        updateCountDisplay();

        // 3. 自动进入下一题 (给个小延迟让用户看到按钮变色反应)
        els.btnIgnore.textContent = "👋 拜拜";
        setTimeout(() => {
            // 如果列表空了
            if (playList.length === 0) {
                alert("本轮单词已全部斩完！");
                loadSelectedUnits(); // 或者处理结束逻辑
            } else {
                nextQuestion();
            }
        }, 300);
    }
}

function updateBtnStates() {
    if (!currentWord) return;

    // 更新斩按钮
    if (ignoredSet.has(currentWord.id)) {
        els.btnIgnore.textContent = "↩️ 撤销";
        els.btnIgnore.classList.add('ignored');
    } else {
        els.btnIgnore.textContent = "🗑️ 斩";
        els.btnIgnore.classList.remove('ignored');
    }

    // 更新收藏按钮
    if (favoriteSet.has(currentWord.id)) {
        els.btnFav.textContent = "⭐ 已收藏";
        els.btnFav.classList.add('active');
    } else {
        els.btnFav.textContent = "⭐ 收藏";
        els.btnFav.classList.remove('active');
    }
}

function resetIgnored() {
    if (confirm("恢复所有已删除单词？")) {
        ignoredSet.clear();
        saveIgnored();
        loadSelectedUnits();
    }
}

// --- 其他 ---
function changeOrder() {
    const radios = document.getElementsByName('order');
    for (let r of radios) if (r.checked) currentOrder = r.value;
    refreshPlayList(false);
}
// --- 切换模式 (适配顶部三按钮) ---
// --- 切换模式 ---
function changeMode(mode) {
    const oldMode = currentMode;
    currentMode = mode;

    // 1. 更新按钮高亮
    if (els.btnModeSpelling) els.btnModeSpelling.classList.remove('active');
    if (els.btnModePlural) els.btnModePlural.classList.remove('active');
    if (els.btnModeCase) els.btnModeCase.classList.remove('active');

    if (mode === 'spelling' && els.btnModeSpelling) els.btnModeSpelling.classList.add('active');
    if (mode === 'plural' && els.btnModePlural) els.btnModePlural.classList.add('active');
    if (mode === 'case' && els.btnModeCase) els.btnModeCase.classList.add('active');

    // 2. 关键逻辑：
    // 如果是从其他模式切到 Case 或 Plural，因为这些模式会过滤单词，
    // 所以必须重新生成播放列表 (refreshPlayList)，否则列表里可能有不符合该模式的词。
    // 如果只是原地渲染，可能会出现名词显示在格位模式里的 bug。

    if (activeList.length > 0) {
        // 重新过滤并刷新列表 (会重置进度到 0)
        // 这是最稳妥的做法，避免“名词卡在动词模式里”
        // 同时也解决了“跳题”问题（因为直接重开了）
        refreshPlayList(false);
    }
}

// 兼容旧代码
function switchMode(mode) {
    changeMode(mode);
}
// 为了兼容旧代码调用，保留 switchMode 但指向新逻辑
//const switchMode = changeMode;

function checkGender(uGender) {
    if (gameState !== 'waiting_answer') return;
    const ok = uGender.toLowerCase() === currentWord.gender.toLowerCase();
    showResult(ok);
}

function submitPlural() {
    if (gameState !== 'waiting_answer') return;

    // 1. 获取输入
    const uSingularRaw = els.inputSingular.value.trim().replace(/\s+/g, ' ');
    const uPlural = els.inputPlural.value.trim();

    // 2. 准备答案
    const targetWord = currentWord.word;
    const targetGender = currentWord.gender ? currentWord.gender.toLowerCase() : "";

    let targetPlural = "-";
    if (currentWord.forms && currentWord.forms.includes("Pl.")) {
        targetPlural = currentWord.forms.replace("Pl.", "").trim().split(',')[0].trim();
    }

    // 3. 验证单数
    let isSingularCorrect = false;
    let inputSingularWordPart = uSingularRaw;

    if (targetGender) {
        const parts = uSingularRaw.split(' ');
        if (parts.length >= 2) {
            const uGen = parts[0].toLowerCase();
            const uWord = parts[1];
            if (uGen === targetGender && uWord === targetWord) isSingularCorrect = true;
            inputSingularWordPart = uWord;
        } else {
            inputSingularWordPart = parts[0];
        }
    } else {
        isSingularCorrect = uSingularRaw === targetWord;
    }

    // 4. 验证复数
    let isPluralCorrect = false;
    if (targetPlural === "-" || targetPlural === "") {
        isPluralCorrect = true;
    } else {
        isPluralCorrect = uPlural === targetPlural;
    }

    const allCorrect = isSingularCorrect && isPluralCorrect;

    // 5. UI 反馈
    els.inputSingular.classList.toggle('input-error', !isSingularCorrect);
    els.inputPlural.classList.toggle('input-error', !isPluralCorrect);

    // 6. 统计与权重
    userStats.total++;
    if (!allCorrect) {
        userStats.errors++;
        updateWeight(currentWord.id, false);

        // 👇👇👇【关键修复】加入错题本逻辑 👇👇👇
        if (!wrongList.find(w => w.id === currentWord.id)) {
            wrongList.push(currentWord);
            updateCountDisplay(); // 实时更新顶部错题数
        }
        // 👆👆👆 修复结束 👆👆👆

        if (!isPluralCorrect && targetPlural !== "-") analyzeError(targetPlural, uPlural);
        if (!isSingularCorrect) analyzeError(targetWord, inputSingularWordPart);
    } else {
        updateWeight(currentWord.id, true);
    }
    saveStats();

    // 7. 显示结果
    gameState = 'waiting_next';
    const displaySingular = targetGender ? `${currentWord.gender} ${targetWord}` : targetWord;
    const displayPlural = targetPlural !== "-" ? targetPlural : "无";

    let resultHTML = "";
    if (allCorrect) {
        resultHTML = `✅ Richtig!<br>Singular: ${displaySingular}<br>Plural: ${displayPlural}`;
        els.result.className = "result correct";
    } else {
        resultHTML = `❌ Falsch!<br>正确单数: <strong>${displaySingular}</strong><br>正确复数: <strong>${displayPlural}</strong>`;
        els.result.className = "result wrong";
    }

    els.result.innerHTML = resultHTML;
    els.infoArea.style.display = 'block';

    document.getElementById('btn-submit-plural').style.display = 'none';
    els.btnNext.style.display = 'inline-block';

    // 给按钮加个延迟聚焦，防止吞回车
    setTimeout(() => els.btnNext.focus(), 50);
}

function submitCase(userChoice) {
    if (gameState !== 'waiting_answer') return;

    const { cleanWord, targetCase } = parseVerbCase(currentWord.word);
    let isCorrect = false;

    // 判分逻辑
    if (userChoice === 'PREP') {
        // 如果答案里包含 + 号 (比如 "auf+A")，选 PREP 就算对
        if (targetCase && targetCase.includes('+')) isCorrect = true;
    } else {
        // 严格匹配：比如 userChoice="D" 必须等于 targetCase="D"
        if (userChoice === targetCase) isCorrect = true;
    }

    // 记录数据
    userStats.total++;
    if (!isCorrect) {
        userStats.errors++;
        updateWeight(currentWord.id, false);
        if (!wrongList.find(w => w.id === currentWord.id)) {
            wrongList.push(currentWord);
            updateCountDisplay();
        }
    } else {
        updateWeight(currentWord.id, true);
    }
    saveStats();

    // 显示结果
    gameState = 'waiting_next';

    const answerDisplay = `${cleanWord} <span style="color:#e03131; font-weight:bold;">&lt;${targetCase}&gt;</span>`;

    let resultHTML = "";
    if (isCorrect) {
        resultHTML = `✅ Richtig! <br>${answerDisplay}`;
        els.result.className = "result correct";
    } else {
        resultHTML = `❌ Falsch! <br>答案是: ${answerDisplay}`;
        els.result.className = "result wrong";
    }

    els.result.innerHTML = resultHTML;

    // 隐藏选项区，显示下一题
    const caseBox = document.getElementById('ui-case-selector');
    if (caseBox) caseBox.style.display = 'none';

    els.btnNext.style.display = 'inline-block';
    els.btnNext.focus();
}

function submitSpelling() {
    if (gameState !== 'waiting_answer') return;

    // 获取用户输入，去头尾空格，变单空格
    const val = els.inputFull.value.trim().replace(/\s+/g, ' ');

    let ok = false;
    let inputWordPart = val; // 用于后续智能分析的“单词部分”

    // --- 核心判断逻辑修改 ---

    // 场景 1: 是名词，且 CSV 里有冠词 (gender 不为空)
    // 例如: "die Familie"
    if (currentWord.type === 'n' && currentWord.gender && currentWord.gender.trim() !== "") {
        const p = val.split(' ');

        // 用户必须输入 "冠词 单词" (至少2部分)
        if (p.length >= 2) {
            const uGender = p[0].toLowerCase(); // 用户输入的冠词
            const uWord = p[1];                 // 用户输入的单词

            // 冠词对 && 单词对
            if (uGender === currentWord.gender.toLowerCase() && uWord === currentWord.word) {
                ok = true;
            }
            inputWordPart = uWord; // 提取出单词部分用于分析
        } else {
            // 用户只输了一个词，肯定是错的，把这个词当作单词部分去分析
            inputWordPart = p[0];
        }
    }
    // 场景 2: 其他情况 (无冠词的名词、动词、形容词等)
    // 例如: "Eltern", "machen", "schnell"
    // 场景 2: 其他情况
    else {
        // 👇👇👇 修改：对比时去掉 <D> 标签 👇👇👇
        const { cleanWord } = parseVerbCase(currentWord.word);

        if (val === cleanWord) { // 只要拼对 helfen 就算对
            ok = true;
        }
        inputWordPart = val;
    }

    // --- 智能分析与统计 (保持不变) ---
    userStats.total++;
    if (!ok) {
        userStats.errors++;
        // 1. 更新权重（惩罚）
        updateWeight(currentWord.id, false);

        // 2. 分析错误原因
        // 这里的 inputWordPart 已经被上面的逻辑处理好了：
        // 如果是 "die Familiee"，它是 "Familiee"
        // 如果是 "Eltern"，它是 "Eltern"
        // 原来是: analyzeError(currentWord.word, inputWordPart);
        // 👇 改为:
        const { cleanWord } = parseVerbCase(currentWord.word);
        analyzeError(cleanWord, inputWordPart);
    } else {
        // 3. 更新权重（奖励）
        updateWeight(currentWord.id, true);
    }
    saveStats();
    // -----------------------

    showResult(ok);
}
function showResult(ok) {
    gameState = 'waiting_next';
    let ansHtml = currentWord.type === 'n' ? `<span class="c-${currentWord.gender}">${currentWord.gender}</span> ${currentWord.word}` : currentWord.word;

    // --- 新增：错题记录逻辑 ---
    if (!ok) {
        // 避免重复添加（如果在同一轮里逻辑有变动的话，加个去重保险）
        if (!wrongList.find(w => w.id === currentWord.id)) {
            wrongList.push(currentWord);
            updateCountDisplay(); // 实时更新错题数
        }
    }
    // -----------------------

    els.result.innerHTML = ok ? `✅ Richtig! ${ansHtml}` : `❌ Falsch! 答案: ${ansHtml}`;
    els.result.className = ok ? "result correct" : "result wrong";
    els.infoArea.style.display = 'block';
    els.infoForms.textContent = currentWord.forms ? `变形: ${currentWord.forms}` : "";
    els.infoExample.textContent = currentWord.example ? `例句: ${currentWord.example}` : "";
    els.btnSubmit.style.display = 'none';
    els.btnNext.style.display = 'inline-block';
    els.btnNext.focus();
}
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('visible');
}
function addChar(c) { els.inputFull.value += c; els.inputFull.focus(); }

// --- 8. 统计面板 UI 逻辑 ---

// 动态创建 HTML 结构（如果不存在）
function ensureStatsModal() {
    if (document.getElementById('stats-overlay')) return;
    const div = document.createElement('div');
    div.id = 'stats-overlay';
    div.className = 'stats-overlay';
    div.innerHTML = `
        <div class="stats-box">
            <div class="stats-header">
                <span class="stats-title">🧠 智能学习诊断</span>
                <button class="stats-close" onclick="closeStatsDashboard()">×</button>
            </div>
            <div id="stats-content"></div>
        </div>
    `;
    document.body.appendChild(div);
}

function showStatsDashboard() {
    ensureStatsModal();
    const overlay = document.getElementById('stats-overlay');
    const content = document.getElementById('stats-content');

    // 计算数据
    const accuracy = userStats.total === 0 ? 0 : Math.round(((userStats.total - userStats.errors) / userStats.total) * 100);

    // 排序混淆对
    const sortedPairs = Object.entries(userStats.confusingPairs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // 只看前10名

    // 渲染内容
    content.innerHTML = `
        <div class="stat-card">
            <h3>总体表现</h3>
            <div class="stat-row">
                <span>刷词总数: ${userStats.total}</span>
                <span>准确率: <strong>${accuracy}%</strong></span>
            </div>
            <div class="bar-container">
                <div class="bar-fill" style="width: ${accuracy}%"></div>
            </div>
        </div>

        <div class="stat-card">
            <h3>🔤 高频拼写混淆 (Top 10)</h3>
            <p style="font-size:12px; color:#666; margin-bottom:10px;">系统检测到你经常将左边的字母错写成右边：</p>
            <div style="display:flex; flex-wrap:wrap;">
                ${sortedPairs.length > 0 ? sortedPairs.map(([pair, count]) =>
        `<span class="confuse-tag">${pair} (${count}次)</span>`
    ).join('') : '<span style="color:#999">暂无足够数据，请继续练习！</span>'}
            </div>
        </div>

        <div class="stat-card">
            <h3>💡 学习建议</h3>
            <p style="font-size:13px; color:#444; line-height:1.5;">
                ${getAdvice(accuracy, sortedPairs)}
            </p>
        </div>
        
        <div style="text-align:center; margin-top:20px;">
            <button onclick="resetStats()" style="background:white; border:1px solid #dee2e6; padding:5px 10px; border-radius:4px; font-size:12px; color:#868e96; cursor:pointer;">重置统计数据</button>
        </div>
    `;

    overlay.style.display = 'flex';
    toggleSidebar(); // 关闭侧边栏以便查看
}

function closeStatsDashboard() {
    document.getElementById('stats-overlay').style.display = 'none';
}

function resetStats() {
    if (confirm("确定要清空所有学习记录和错题权重吗？")) {
        userStats = { total: 0, errors: 0, confusingPairs: {} };
        wordWeights = {};
        localStorage.removeItem('dv_stats');
        localStorage.removeItem('dv_weights');
        closeStatsDashboard();
        alert("已重置，一切从新开始！");
    }
}

// 简单的建议生成器
function getAdvice(acc, pairs) {
    if (acc > 90) return "你的状态非常棒！目前的难度对你来说可能太低了。";
    if (acc < 60) return "错误率较高，建议放慢速度，先在“按顺序”模式下熟悉单词。";
    if (pairs.length > 0) {
        const top = pairs[0][0];
        return `注意！你最大的问题是经常搞混 <strong>${top}</strong>。下次遇到带有这些字母的词时，请停顿一秒再输入。`;
    }
    return "保持练习，系统正在分析你的习惯...";
}
window.showStatsDashboard = showStatsDashboard;
window.closeStatsDashboard = closeStatsDashboard;
window.resetStats = resetStats;


// --- 10. 数据备份与恢复 (Model Checkpoint) ---

// 导出参数 (Save Model)
function exportData() {
    const data = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        stats: userStats,          // 混淆矩阵和错误率
        weights: wordWeights,      // 单词权重
        favorites: [...favoriteSet], // 收藏集 (Set转Array)
        ignored: [...ignoredSet],    // 斩词集 (Set转Array)
        settings: JSON.parse(localStorage.getItem('dv_settings') || "{}") // 当前设置
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // 创建临时下载链接
    const a = document.createElement('a');
    a.href = url;
    a.download = `german_vocab_checkpoint_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 导入参数 (Load Model)
function triggerImport() {
    // 模拟点击文件选择框
    document.getElementById('file-input').click();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            // 简单的格式校验
            if (!data.stats || !data.weights) {
                throw new Error("文件格式不正确，缺少核心参数");
            }

            if (confirm(`检测到备份文件：\n时间: ${data.timestamp}\n\n确定要覆盖当前的学习记录吗？`)) {
                // 1. 恢复内存变量
                userStats = data.stats;
                wordWeights = data.weights;
                favoriteSet = new Set(data.favorites); // Array转Set
                ignoredSet = new Set(data.ignored);    // Array转Set

                // 2. 写入硬盘 (LocalStorage)
                saveStats();
                localStorage.setItem('dv_weights', JSON.stringify(wordWeights));
                saveFavorites();
                saveIgnored();
                if (data.settings) localStorage.setItem('dv_settings', JSON.stringify(data.settings));

                alert("✅ 参数导入成功！页面即将刷新以应用更改。");
                location.reload(); // 刷新页面
            }
        } catch (err) {
            alert("❌ 导入失败: " + err.message);
        }
    };
    reader.readAsText(file);
    // 清空 input 防止重复上传同个文件不触发 onchange
    event.target.value = '';
}

// --- 11. 垃圾桶管理系统 (Trash System) ---

function ensureTrashModal() {
    if (document.getElementById('trash-overlay')) return;
    const div = document.createElement('div');
    div.id = 'trash-overlay';
    div.className = 'trash-overlay';
    div.innerHTML = `
        <div class="trash-box">
            <div class="trash-header">
                <h2>🗑️ 垃圾桶 (已斩单词)</h2>
                <button class="stats-close" onclick="closeTrashCan()">×</button>
            </div>
            <ul id="trash-list" class="trash-list"></ul>
            <div style="padding:10px; border-top:1px solid #eee; text-align:right;">
                <button onclick="restoreAll()" style="color:#e03131; background:none; border:none; cursor:pointer; font-size:12px; text-decoration:underline;">全部恢复</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

function showTrashCan() {
    ensureTrashModal();
    const listEl = document.getElementById('trash-list');
    listEl.innerHTML = "";

    // 1. 找出所有被斩的单词
    // 注意：我们需要从 activeList (当前加载的单元) 里面找，
    // 或者如果你想看所有单元的垃圾，得遍历 configData 加载所有词（比较慢）。
    // 这里我们仅展示“当前已加载单元中”被删除的词，这样逻辑最清晰。
    const deletedWords = activeList.filter(w => ignoredSet.has(w.id));

    if (deletedWords.length === 0) {
        listEl.innerHTML = `<div class="empty-trash-msg">垃圾桶是空的<br>当前加载的单元没有被斩掉的词</div>`;
    } else {
        deletedWords.forEach(w => {
            const li = document.createElement('li');
            li.className = 'trash-item';
            li.innerHTML = `
                <div class="trash-info">
                    <div>
                        <span class="trash-word">${w.word}</span>
                        <span class="trash-cn">${w.cn}</span>
                    </div>
                    <div class="trash-meta">📂 ${w.unit}</div>
                </div>
                <button class="btn-restore" onclick="restoreOne('${w.id}')">♻️ 恢复</button>
            `;
            listEl.appendChild(li);
        });
    }

    document.getElementById('trash-overlay').style.display = 'flex';
    toggleSidebar(); // 关闭侧边栏
}

function closeTrashCan() {
    document.getElementById('trash-overlay').style.display = 'none';
}

// 恢复单个单词
window.restoreOne = function (id) {
    if (ignoredSet.has(id)) {
        ignoredSet.delete(id);
        saveIgnored();

        // 重新渲染垃圾桶列表（视觉上移除该行）
        showTrashCan();

        // 关键：如果这个词属于当前题库，我们要把它加回 playList 吗？
        // 简单做法：不强制加回当前播放列表，但下一轮刷新时它会出现。
        // 或者：如果用户希望立刻能练到，可以提示用户“已恢复，将在下一轮出现”。

        // 这里做一个小 trick：如果当前播放列表很短，我们可以把它 push 进去
        // 但为了逻辑稳健，我们暂时只更新 ignoredSet，等用户下次刷新或重新加载时生效。
    }
};

// 恢复全部
window.restoreAll = function () {
    if (confirm("确定要把垃圾桶里的词全部捡回来吗？")) {
        ignoredSet.clear();
        saveIgnored();
        showTrashCan();
        alert("垃圾桶已清空，所有单词已恢复！");
    }
};
window.showTrashCan = showTrashCan;
window.closeTrashCan = closeTrashCan;
// --- 9. 键盘监听 (必须保留在文件最末尾) ---
// --- 9. 键盘监听 (修复版) ---
// --- 9. 键盘监听 (最终增强版: 支持数字键选答案) ---
document.addEventListener('keydown', e => {
    // 0. 全局忽略：如果正在弹窗里输入或者按了功能键，忽略
    const overlay = document.getElementById('modal-overlay');
    if (overlay && overlay.style.display === 'flex') return;

    // 获取按键 (e.key 会自动处理小键盘，Numpad 1 也是 "1")
    const key = e.key;

    // ------------------------------------------------
    // 场景 A: 等待答题 (waiting_answer)
    // ------------------------------------------------
    if (gameState === 'waiting_answer') {

        // 【Case 模式专用快捷键】: 1, 2, 3, 4, 5
        if (currentMode === 'case') {
            // 如果按的是 1-5，直接触发选择
            if (['1', '2', '3', '4', '5'].includes(key)) {
                e.preventDefault(); // 防止页面滚动或输入框输入

                // 映射表：数字键 -> 对应的参数
                const keyMap = {
                    '1': 'N',    // 按 1 选 Nom
                    '2': 'D',    // 按 2 选 Dat
                    '3': 'A',    // 按 3 选 Akk
                    '4': 'DA',   // 按 4 选 双宾
                    '5': 'PREP'  // 按 5 选 介词
                };

                // 只有当按钮区显示的时候，快捷键才有效
                // (防止那个“降级为拼写框”的情况下误触)
                const caseBox = document.getElementById('ui-case-selector');
                if (caseBox && caseBox.style.display !== 'none') {
                    submitCase(keyMap[key]);
                }
                return;
            }
        }

        // 回车键逻辑 (提交)
        if (key === 'Enter') {
            e.preventDefault();

            if (currentMode === 'plural') {
                submitPlural();
            }
            else if (currentMode === 'spelling') {
                submitSpelling();
            }
            else if (currentMode === 'case') {
                // 如果是 Case 模式，且输入框显示了（说明是没标签的词，降级拼写）
                if (els.uiInput.style.display !== 'none') {
                    submitSpelling();
                }
            }
        }
    }

    // ------------------------------------------------
    // 场景 B: 等待下一题 (waiting_next)
    // ------------------------------------------------
    else if (gameState === 'waiting_next') {
        // 任何模式下，按回车或空格都去下一题
        if (key === 'Enter' || key === ' ') {
            e.preventDefault();
            nextQuestion();
        }
    }
});
