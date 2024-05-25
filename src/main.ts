import { App, Platform, Plugin, PluginSettingTab, Setting, TFile, TFolder, View, WorkspaceLeaf } from 'obsidian';

declare module 'obsidian' {
  interface App {
    isMobile: boolean;
  }
  interface WorkspaceSidedock {
    containerEl: HTMLElement;
  }
  interface WorkspaceMobileDrawer {
    containerEl: HTMLElement;
  }
}

interface FileItem {
  titleEl: HTMLElement;
  selfEl: HTMLElement;
  file: TFile | TFolder;
}

interface FilePreviewSettings {
  showpreview: boolean;
  lineClamp: number;
  previewcontentslength: string;
  ispreview: boolean;
  format: FormatSetting;
}

interface FileExplorerLeaf extends WorkspaceLeaf {
  view: FileExplorerView;
}

interface FileExplorerView extends View {
  fileItems: { [path: string]: FileItem };
}

interface FormatSetting {
  frontmatter: boolean;
  bolditalic: boolean;
  highlight: boolean;
  codeblock: boolean;
  quote: boolean;
  blankline: boolean;
  title: boolean;
}

export default class FilePreview extends Plugin {
  settings: FilePreviewSettings;
  fileExplorerView: FileExplorerView;
  fileNavEl: HTMLElement;
  previewContentsEl: HTMLElement[] = [];

  async onload() {
    if (Platform.isMobile || this.app.isMobile) {
      return;
    }
    await this.loadSettings();
    this.addSettingTab(new FilePreviewSettingTab(this.app, this));
    
    await this.initialize();
    this.addRibbonIcon('refresh-cw', 'Refresh preview contents', async () => {
      this.refreshPreviewContents();
    });
    await this.saveSettings();
  }

  onunload() {
    this.deletePreviewContents();
    this.saveSettings();
  }

  public async initialize() {
    this.app.workspace.onLayoutReady(async () => {
      try {    
        this.fileExplorerView = await this.getFileExplorerView(); // 测试文件夹树是否加载
        this.fileNavEl = this.fileExplorerView.containerEl;
        if (this.settings.showpreview) {
          await this.displayPreviewContents();
        }
      } catch (err) {
        // File Explorer pane may not be loaded yet
        setTimeout(() => {
          this.initialize();
        }, 1000);
      }
    });
  }

  public async displayPreviewContents() {
    this.fileNavEl.classList.add('file-preview-nav');
    const fileItems = this.fileExplorerView.fileItems;
    for (const path in fileItems) {
      const item = fileItems[path];
      if (path === '/' || !(item.file instanceof TFile) || item.file.extension !== 'md') {
        continue;
      }
      await this.app.vault.cachedRead(item.file).then((contents) => {
        const formattedContents = this.formatContents(contents.trim());
        if (formattedContents) {
          item.selfEl.classList.add('file-preview-nav-file-title');
          this.previewContentsEl.push(item.selfEl.createEl('div', { 
            text: formattedContents, 
            attr: { 
              class: 'tree-item-inner nav-file-title-content nav-file-details',
              style: `-webkit-line-clamp: ${this.settings.lineClamp};`
            } 
          }));
        }
      });
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

  public async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  public async saveSettings() {
    await this.saveData(this.settings);
  }
}

const DEFAULT_SETTINGS: FilePreviewSettings = {
  showpreview: true,
  lineClamp: 2,
  previewcontentslength: '50',
  ispreview: false,
  format: {
    frontmatter: true,
    bolditalic: true,
    highlight: true,
    codeblock: true,
    quote: true,
    blankline: true,
    title: true
  }
}

class FilePreviewSettingTab extends PluginSettingTab {
  plugin: FilePreview;

  constructor(app: App, plugin: FilePreview) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this
    containerEl.empty();

    new Setting(containerEl)
      .setName("Show preview contents")
      .setDesc("Show preview contents in the file explorer")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showpreview)
        .onChange(async (value) => {
          this.plugin.settings.showpreview = value;
          if (value) {
            await this.plugin.initialize();
          } else {
            await this.plugin.deletePreviewContents();
          }
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Length of the preview contents")
      .setDesc("default: 50")
      .addText(text => text
        .setPlaceholder("50")
        .setValue(this.plugin.settings.previewcontentslength)
        .onChange(async (value) => {
          this.plugin.settings.previewcontentslength = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Line clamp")
      .setDesc("The number of lines to show in the preview contents. default: 2")
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.lineClamp)
        .onChange(async (value) => {
          this.plugin.settings.lineClamp = value;
          await this.plugin.refreshPreviewContents();
          await this.plugin.saveSettings();
        })
      )

    new Setting(containerEl).setName('Format preview contents').setHeading();
    
    new Setting(containerEl)
      .setName("Remove frontmatter")
      .setDesc("Remove frontmatter of the file")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.frontmatter)
        .onChange(async (value) => {
          this.plugin.settings.format.frontmatter = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Remove bold and italic symbols")
      .setDesc("Remove bold and italic symbols of the file")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.bolditalic)
        .onChange(async (value) => {
          this.plugin.settings.format.bolditalic = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Remove highlight symbols")
      .setDesc("Remove highlight symbols of the file")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.highlight)
        .onChange(async (value) => {
          this.plugin.settings.format.highlight = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Remove code block")
      .setDesc("Remove code block of the file")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.codeblock)
        .onChange(async (value) => {
          this.plugin.settings.format.codeblock = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Remove quote")
      .setDesc("Remove quote of the file")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.quote)
        .onChange(async (value) => {
          this.plugin.settings.format.quote = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Remove blank line")
      .setDesc("Remove blank line of the file")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.blankline)
        .onChange(async (value) => {
          this.plugin.settings.format.blankline = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Remove title symbol")
      .setDesc("Remove title symbol of the file")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.title)
        .onChange(async (value) => {
          this.plugin.settings.format.title = value;
          await this.plugin.saveSettings();
        }));
  }
}