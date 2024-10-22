import { DEFAULT_SETTINGS, FilePreviewSettingTab, FilePreviewSettings, } from "./settings";
import { Plugin, TFile, TFolder, View, WorkspaceLeaf, addIcon, moment, normalizePath, setIcon, } from "obsidian";

declare module "obsidian" {
  interface WorkspaceSidedock {
    containerEl: HTMLElement;
  }
  interface WorkspaceMobileDrawer {
    containerEl: HTMLElement;
  }
  interface TFolder {
    extension: string;
  }
  interface TFile {
    extension: string;
    stat: FileStats;
  }
}

interface FileItem {
  titleEl: HTMLElement;
  el: HTMLElement;
  innerEl: HTMLElement;
  selfEl: HTMLElement;
  file: TFile | TFolder;
}

interface FileExplorerLeaf extends WorkspaceLeaf {
  view: FileExplorerView;
}

interface FileExplorerView extends View {
  fileItems: { [path: string]: FileItem };
}

export default class FilePreview extends Plugin {
  settings: FilePreviewSettings;
  settingTab: FilePreviewSettingTab;
  fileExplorerView: FileExplorerView;
  fileNavEl: HTMLElement;
  showpreviewBtn: HTMLElement;
  previewContentsEl: HTMLElement[] = [];
  imagePaths: string[];
  ttl: number;

  async onload() {
    await this.loadSettings();
    // Apply custom regex (New config in 1.1.3)
    if (!this.settings.format?.customregex) {
      this.settings.format.customregex = [];
      this.saveData(this.settings);
    } else if (!this.settings.excluded) {
      this.settings.excluded = [];
      this.saveData(this.settings);
    }
    this.settingTab = new FilePreviewSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    await this.initialize();

    this.registerCommands();

    // Add hot reload with debounce
    const debounce = (func: () => void, wait: number) => {
      let timeout: number;
      return () => {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => func.apply(this), wait);
      };
    };

    const debouncedRefresh = debounce(async () => {
      if (this.settings.showpreview && this.settings.ispreview) {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const activeFilePath = activeFile.path;
          const fileItem =
            this.fileExplorerView.fileItems[activeFilePath];
          if (fileItem) {
            this.displayPreviewContentsByFileItem(fileItem);
          }
        }
      }
    }, 10);

    this.app.workspace.on("editor-change", debouncedRefresh);

    // file-menu 右键菜单：将文件/文件夹排除在外
    this.app.workspace.on("file-menu", (menu, file) => {
      if (!file || this.settings.excluded.includes(file.path)) {
        return;
      }
      menu.addItem((item) => {
        item.setIcon("trash");
        item.setTitle(file instanceof TFolder ? "Exclude folder" : "Exclude file");
        item.onClick(() => {
          this.settings.excluded.push(file.path);
          this.saveSettings();
          this.refreshPreviewContents();
        });
      });
    });

    this.ttl = 5;

    addIcon(
      "captions",
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-captions"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg>'
    );
    addIcon(
      "captions-off",
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-captions-off"><path d="M10.5 5H19a2 2 0 0 1 2 2v8.5"/><path d="M17 11h-.5"/><path d="M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2"/><path d="m2 2 20 20"/><path d="M7 11h4"/><path d="M7 15h2.5"/></svg>'
    );

    await this.saveSettings();
  }

  onunload() {
    this.showpreviewBtn.remove();
    this.deletePreviewContents();
    this.saveSettings();
  }

  public async initialize() {
    this.app.workspace.onLayoutReady(async () => {
      try {
        this.fileExplorerView = await this.getFileExplorerView(); // 测试文件夹树是否加载
        this.fileNavEl = this.fileExplorerView.containerEl;
        this.initImagePaths();
        this.createShowPreviewButton(
          this.fileNavEl.querySelector(
            ".nav-header > .nav-buttons-container"
          ) as HTMLElement
        );
        if (this.settings.showpreview) {
          await this.refreshPreviewContents();
        }
      } catch (err) {
        console.log(err);
        if (this.ttl <= 0) {
          return;
        }
        // File Explorer panel may not be loaded yet
        this.ttl -= 1;
        setTimeout(() => {
          this.initialize();
        }, 1000);
      }
    });
  }

  public createShowPreviewButton(fileNavHeader: HTMLElement) {
    if (this.showpreviewBtn) {
      return;
    }
    this.showpreviewBtn = fileNavHeader.createDiv({
      cls: "clickable-icon nav-action-button show-preview-button",
      attr: { "aria-label": "Show/Hide preview contents" },
    });
    if (this.settings.ispreview) {
      setIcon(this.showpreviewBtn, "captions-off");
    } else {
      setIcon(this.showpreviewBtn, "captions");
    }
    this.registerDomEvent(this.showpreviewBtn, "click", () => {
      this.togglePreviewContents();
      if (this.settings.ispreview) {
        setIcon(this.showpreviewBtn, "captions-off");
        this.settings.ispreview = false;
      } else {
        setIcon(this.showpreviewBtn, "captions");
        this.settings.ispreview = true;
      }
      this.saveSettings();
    });
  }

  public async displayPreviewContents() {
    this.fileNavEl.classList.add("file-preview-nav");
    const fileItems = this.fileExplorerView.fileItems;
    for (const path in fileItems) {
      const item = fileItems[path];
      if (
        path === "/" ||
        this.isExcluded(item.file) ||
        !(item.file instanceof TFile) ||
        item.file.extension !== "md" ||
        this.isExcluded(item.file)
      ) {
        continue;
      }
      this.displayPreviewContentsByFileItem(item);
    }

    this.settings.ispreview = true;
  }

  public isExcluded(file: TFile | TFolder): boolean {
    return this.settings.excluded.some((path) => path && file.path.startsWith(path));
  }


  public async getFileExplorerView(): Promise<FileExplorerView> {
    return new Promise((resolve, reject) => {
      let foundLeaf: FileExplorerLeaf | null = null;
      const leafs = this.app.workspace.getLeavesOfType(
        "file-explorer"
      ) as FileExplorerLeaf[];
      if (leafs.length === 0) {
        reject(Error("Could not find file explorer view."));
      } else {
        foundLeaf = leafs[0];
        resolve(foundLeaf.view);
      }
      if (!foundLeaf) {
        reject(Error("Could not find file explorer view."));
      }
    });
  }

  public togglePreviewContents() {
    this.fileNavEl.classList.toggle("hide-preview-contents");
  }

  public async deletePreviewContents() {
    this.fileNavEl.classList.remove("file-preview-nav");
    this.fileNavEl.classList.remove("hide-preview-contents");
    this.previewContentsEl.forEach((el) => {
      el.remove();
    });
    this.previewContentsEl = [];
    this.settings.ispreview = false;
    this.saveSettings();
  }

  public async refreshPreviewContents() {
    if (this.settings.ispreview) {
      this.deletePreviewContents();
    }
    this.displayPreviewContents();
  }

  public async displayPreviewContentsByFileItem(item: FileItem) {
    const file = item.file as TFile;
    if (!file) {
      return;
    }
    await this.app.vault.cachedRead(file).then((contents) => {
      const formattedContents = this.formatContents(contents.trim(), file.basename);
      if (!formattedContents) {
        return;
      }
      if (item.innerEl && item.el.querySelector(".nav-file-details")) {
        const currentContentEl = item.selfEl.querySelector(".tree-item-inner.nav-file-details");
        if (currentContentEl && formattedContents !== currentContentEl.innerHTML) {
          currentContentEl.innerHTML = formattedContents;
        }
        if (this.settings.showFileProperties) {
          const ctime = moment(file.stat.ctime).format(
            this.settings.ctimeFormat
          );
          const mtime = moment(file.stat.mtime).format(
            this.settings.mtimeFormat
          );
          const timeInfoString = this.settings.propertiesFormat
            .replace("ctime", ctime)
            .replace("mtime", mtime);
          const currentPropertiesEl = item.selfEl.querySelector(".nav-file-properties");
          if (currentPropertiesEl) {
            currentPropertiesEl.innerHTML = timeInfoString;
          }
        }
        return;
      }
      // item.selfEl.classList.add("fp-nav-file");
      this.previewContentsEl.push(
        item.selfEl.createEl("div", {
          text: formattedContents,
          attr: {
            class: "tree-item-inner nav-file-details",
            style: `-webkit-line-clamp: ${this.settings.lineClamp}; text-indent: ${this.settings.indents}em;`,
          },
        })
      );

      if (this.settings.showFileProperties) {
        const ctime = moment(file.stat.ctime).format(
          this.settings.ctimeFormat
        );
        const mtime = moment(file.stat.mtime).format(
          this.settings.mtimeFormat
        );
        const timeInfoString = this.settings.propertiesFormat
          .replace("ctime", ctime)
          .replace("mtime", mtime);

        this.previewContentsEl.push(
          item.selfEl.createEl("div", {
            text: timeInfoString,
            attr: {
              class: "nav-file-properties",
            },
          })
        );
      }
      if (this.settings.showImg) {
        let imgpath = this.getFirstImgPath(contents);
        if (!imgpath || item.el.querySelector('.nav-file-img')) { return; }
        item.el.classList.add("file-preview-show-img");
        const fileimg = item.el.createEl("div", {
          attr: {
            class: "tree-item-inner nav-file-img",
          },
        });
        if (!imgpath.startsWith("http")) {
          const absolutePath =
            this.imagePaths.find((path) =>
              path.endsWith(imgpath)
            ) || imgpath;
          imgpath = this.app.vault.adapter.getResourcePath(normalizePath(absolutePath));
        }
        fileimg.createEl("div", {
          attr: {
            class: "preview-img",
            style: `background-image: url(${imgpath})`,
          },
        });
        this.previewContentsEl.push(fileimg);
      }
    });
  }

  public formatContents(contents: string, basename: string): string {
    let formatContents = contents;
    // Remove frontmatter
    if (contents.startsWith("---") && this.settings.format.frontmatter) {
      formatContents = contents.replace(/---[\s\S]*?---/, "");
    }

    const endOfFirstLine = formatContents.indexOf("\n");
    const firstLine = formatContents.slice(0, endOfFirstLine).trim();

    // Remove first h1 title
    if (
      this.settings.format.firsth1 &&
      (firstLine.startsWith("# ") || firstLine === basename)
    ) {
      formatContents = formatContents.slice(endOfFirstLine);
    }

    // Remove first h2 title
    if (this.settings.format.firsth2 && firstLine.startsWith("## ")) {
      formatContents = formatContents.slice(endOfFirstLine);
    }

    // Remove bold and italic
    if (this.settings.format.bolditalic) {
      formatContents = formatContents.replace(/(\*\*|__)(.*?)\1/g, "$2");
      formatContents = formatContents.replace(/(\*|_)(.*?)\1/g, "$2");
    }
    // Remove highlight
    if (this.settings.format.highlight) {
      formatContents = formatContents.replace(/===(.*?)===/g, "$1");
    }
    // Remove code block
    if (this.settings.format.codeblock) {
      formatContents = formatContents.replace(/`{5}[\s\S]*?`{5}/g, "");
      formatContents = formatContents.replace(/`{4}[\s\S]*?`{4}/g, "");
      formatContents = formatContents.replace(/`{3}[\s\S]*?`{3}/g, "");
    }
    // Remove quote '> ..\n>..'
    if (this.settings.format.quote) {
      formatContents = formatContents.replace(/(^>.*\n*)+/g, "");
    }
    // clear blank line
    if (this.settings.format.blankline) {
      formatContents = formatContents.replace(/^\s*\n/g, "");
    }
    // Remove title symbol
    formatContents = formatContents.replace(/#+/g, "");

    // Remove wiki link: [[]] & markdown link: []() & image link: ![]()
    formatContents = formatContents.replace(/!\[.*?\]\(.*?\)/g, "");
    formatContents = formatContents.replace(/\[\[.*?\]\]/g, "");
    formatContents = formatContents.replace(/\[.*?\]\(.*?\)/g, "");

    for (let i = 0; i < this.settings.format.customregex.length; i++) {
      formatContents = formatContents.replace(new RegExp(this.settings.format.customregex[i], "g"), "");
    }

    return formatContents.slice(0, parseInt(this.settings.previewcontentslength)).trim();
  }

  public getFirstImgPath(contents: string): string {
    // 正则匹配获取 ![[]], ![]() 的图片路径，匹配第一个，判断后缀是否为图片格式
    const imgReg = /!\[\[(.*?)\](?!\|bb\]\])|!\[(.*?)\]\((.*?)\)/;

    const ImgMatch = contents.match(imgReg);
    if (ImgMatch) {
      const imgPath = ImgMatch[1] || ImgMatch[3];
      if (imgPath.includes("|")) {
        return imgPath.split("|")[0];
      }
      return imgPath;
    }

    return "";
  }

  public async initImagePaths() {
    const allpaths = this.app.vault.getFiles().map((file) => file.path);
    const imgpaths = allpaths.filter((path) => this.pathIsImg(path));
    this.imagePaths = imgpaths;
  }

  public pathIsImg(path: string): boolean {
    return (
      path.endsWith(".png") ||
      path.endsWith(".jpg") ||
      path.endsWith(".jpeg") ||
      path.endsWith(".gif") ||
      path.endsWith(".webp")
    );
  }

  public registerCommands() {
    this.addCommand({
      id: "refresh-preview-contents",
      name: "Refresh preview contents",
      callback: async () => {
        this.refreshPreviewContents();
      },
    });

    this.addCommand({
      id: "show-preview-contents",
      name: "Show preview contents",
      callback: async () => {
        await this.displayPreviewContents();
      },
    });

    this.addCommand({
      id: "hide-preview-contents",
      name: "Hide preview contents",
      callback: async () => {
        this.fileNavEl.classList.add("hide-preview-contents");
        this.settings.ispreview = false;
        this.saveSettings();
      },
    });

    this.addCommand({
      id: "show-preview-contents",
      name: "Show preview contents",
      callback: async () => {
        this.fileNavEl.classList.remove("hide-preview-contents");
        this.settings.ispreview = true;
        this.saveSettings();
      },
    });
  }

  public async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  public async saveSettings() {
    await this.saveData(this.settings);
  }
}
