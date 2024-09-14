import { DEFAULT_SETTINGS, FilePreviewSettingTab, FilePreviewSettings } from './settings'
import { Plugin, TFile, TFolder, View, WorkspaceLeaf, addIcon, moment, normalizePath, setIcon } from 'obsidian';

declare module 'obsidian' {
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
    this.settingTab = new FilePreviewSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    await this.initialize();
    this.addRibbonIcon('refresh-cw', 'Refresh preview contents', async () => {
      this.refreshPreviewContents();
    });

    this.addRibbonIcon('trash', 'Delete preview contents', async () => {
      this.deletePreviewContents();
    });

    this.ttl = 5;

    addIcon('captions', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-captions"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg>');
    addIcon('captions-off', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-captions-off"><path d="M10.5 5H19a2 2 0 0 1 2 2v8.5"/><path d="M17 11h-.5"/><path d="M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2"/><path d="m2 2 20 20"/><path d="M7 11h4"/><path d="M7 15h2.5"/></svg>')

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
        this.createShowPreviewButton(this.fileNavEl.querySelector('.nav-header > .nav-buttons-container') as HTMLElement);
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
    this.showpreviewBtn = fileNavHeader.createDiv({ cls: 'clickable-icon nav-action-button show-preview-button', attr: { 'aria-label': 'Show/Hide preview contents' } });
    if (this.settings.ispreview) {
      setIcon(this.showpreviewBtn, 'captions-off');
    } else {
      setIcon(this.showpreviewBtn, 'captions');
    }
    this.registerDomEvent(this.showpreviewBtn, 'click', async () => {
      if (this.settings.ispreview) {
        this.deletePreviewContents();
        setIcon(this.showpreviewBtn, 'captions-off');
      } else {
        await this.displayPreviewContents();
        setIcon(this.showpreviewBtn, 'captions');
      }
    });
    this.saveSettings();
  }

  public async displayPreviewContents() {
    this.fileNavEl.classList.add('file-preview-nav');
    const fileItems = this.fileExplorerView.fileItems;
    if (this.settings.showImg) {
      for (const path in fileItems) {
        const item = fileItems[path];
        if (path === '/' || !(item.file instanceof TFile) || item.file.extension !== 'md') {
          continue;
        }
        const file = item.file as TFile;
        await this.app.vault.cachedRead(file).then((contents) => {
          const formattedContents = this.formatContents(contents.trim());

          let imgpath = this.getFirstImgPath(contents);
          item.selfEl.classList.add('fp-nav-file');
          if (formattedContents) {
            this.previewContentsEl.push(item.selfEl.createEl('div', {
              text: formattedContents,
              attr: {
                class: 'tree-item-inner nav-file-details',
                style: `-webkit-line-clamp: ${this.settings.lineClamp}; text-indent: ${this.settings.indents}em;`
              }
            }));
            if (this.settings.showFileProperties) {
              const ctime = moment(file.stat.ctime).format(this.settings.ctimeFormat);
              const mtime = moment(file.stat.mtime).format(this.settings.mtimeFormat);
              const timeInfoString = this.settings.propertiesFormat.replace('ctime', ctime).replace('mtime', mtime);

              this.previewContentsEl.push(item.selfEl.createEl('div', {
                text: timeInfoString,
                attr: {
                  class: 'nav-file-properties'
                }
              }));
            }
            if (imgpath) {
              item.el.classList.add('file-preview-show-img');
              const fileimg = item.el.createEl('div', {
                attr: {
                  class: 'tree-item-inner nav-file-img',
                }
              })
              if (!imgpath.startsWith('http')) {
                const absolutePath = this.imagePaths.find((path) => path.endsWith(imgpath)) || imgpath;
                imgpath = this.app.vault.adapter.getResourcePath(normalizePath((absolutePath)));
              }
              fileimg.createEl('div', {
                attr: {
                  class: 'preview-img',
                  style: `background-image: url(${imgpath})`,
                }
              });
              this.previewContentsEl.push(fileimg);
            }
          }
        });
      }
    } else {
      for (const path in fileItems) {
        const item = fileItems[path];
        if (path === '/' || !(item.file instanceof TFile) || item.file.extension !== 'md') {
          continue;
        }
        const file = item.file as TFile;
        await this.app.vault.cachedRead(item.file).then((contents) => {
          const formattedContents = this.formatContents(contents.trim());
          if (formattedContents) {
            item.selfEl.classList.add('fp-nav-file');
            this.previewContentsEl.push(item.selfEl.createEl('div', {
              text: formattedContents,
              attr: {
                class: 'tree-item-inner nav-file-details',
                style: `-webkit-line-clamp: ${this.settings.lineClamp}; text-indent: ${this.settings.indents}em;`
              }
            }));
            if (this.settings.showFileProperties) {
              const ctime = moment(file.stat.ctime).format(this.settings.ctimeFormat);
              const mtime = moment(file.stat.ctime).format(this.settings.mtimeFormat);
              const timeInfoString = this.settings.propertiesFormat.replace('ctime', ctime).replace('mtime', mtime);

              this.previewContentsEl.push(item.selfEl.createEl('div', {
                text: timeInfoString,
                attr: {
                  class: 'nav-file-properties'
                }
              }));
            }
          }
        });
      }
    }
    this.settings.ispreview = true;
  }

  public async getFileExplorerView(): Promise<FileExplorerView> {
    return new Promise((resolve, reject) => {
      let foundLeaf: FileExplorerLeaf | null = null;
      const leafs = this.app.workspace.getLeavesOfType("file-explorer") as FileExplorerLeaf[];
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

  public async deletePreviewContents() {
    this.fileNavEl.classList.remove('file-preview-nav');
    this.previewContentsEl.forEach((el) => {
      el.remove();
    });
    this.previewContentsEl = [];
    this.settings.ispreview = false;
  }

  public async refreshPreviewContents() {
    if (this.settings.ispreview) {
      this.deletePreviewContents();
    }
    this.displayPreviewContents();
  }

  public formatContents(contents: string): string {
    let formatContents = contents;
    // Remove frontmatter
    if (contents.startsWith('---') && this.settings.format.frontmatter) {
      formatContents = contents.replace(/---[\s\S]*?---/, '');
    }
    // Remove bold and italic
    if (this.settings.format.bolditalic) {
      formatContents = formatContents.replace(/(\*\*|__)(.*?)\1/g, '$2');
      formatContents = formatContents.replace(/(\*|_)(.*?)\1/g, '$2');
    }
    // Remove highlight
    if (this.settings.format.highlight) {
      formatContents = formatContents.replace(/===(.*?)===/g, '$1');
    }
    // Remove code block
    if (this.settings.format.codeblock) {
      formatContents = formatContents.replace(/`{5}[\s\S]*?`{5}/g, '');
      formatContents = formatContents.replace(/`{4}[\s\S]*?`{4}/g, '');
      formatContents = formatContents.replace(/`{3}[\s\S]*?`{3}/g, '');
    }
    // Remove quote '> ..\n>..'
    if (this.settings.format.quote) {
      formatContents = formatContents.replace(/(^>.*\n*)+/g, '');
    }
    // clear blank line
    if (this.settings.format.blankline) {
      formatContents = formatContents.replace(/^\s*\n/g, '');
    }
    // Remove title symbol
    formatContents = formatContents.replace(/#+/g, '');

    // Remove wiki link: [[]] & markdown link: []() & image link: ![]()
    formatContents = formatContents.replace(/!\[.*?\]\(.*?\)/g, '');
    formatContents = formatContents.replace(/\[\[.*?\]\]/g, '');
    formatContents = formatContents.replace(/\[.*?\]\(.*?\)/g, '');

    return formatContents.slice(0, parseInt(this.settings.previewcontentslength)).trim();
  }

  public getFirstImgPath(contents: string): string {
    // 正则匹配获取 ![[]], ![]() 的图片路径，匹配第一个，判断后缀是否为图片格式
    const imgReg = /!\[\[(.*?)\](?!\|bb\]\])|!\[(.*?)\]\((.*?)\)/;

    const ImgMatch = contents.match(imgReg);
    if (ImgMatch) {
      const imgPath = ImgMatch[1] || ImgMatch[3];
      if (imgPath.includes('|')) {
        return imgPath.split('|')[0];
      }
      return imgPath;
    }

    return '';
  }

  public async initImagePaths() {
    const allpaths = this.app.vault.getFiles().map((file) => file.path);
    const imgpaths = allpaths.filter((path) => this.pathIsImg(path));
    this.imagePaths = imgpaths;
  }

  public pathIsImg(path: string): boolean {
    return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif') || path.endsWith('.webp');
  }

  public async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  public async saveSettings() {
    await this.saveData(this.settings);
  }
}
