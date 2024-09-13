import { App, PluginSettingTab, Setting } from 'obsidian';

import FilePreview from './main'
import { t } from 'src/lang/helper';

export interface FilePreviewSettings {
  showpreview: boolean;
  lineClamp: number;
  indents: number;
  previewcontentslength: string;
  ispreview: boolean;
  format: FormatSetting;
  showImg: boolean;
  showFileProperties: boolean;
  ctimeFormat: string;
  mtimeFormat: string;
  propertiesFormat: string;
}

export const DEFAULT_SETTINGS: FilePreviewSettings = {
  showpreview: true,
  lineClamp: 2,
  indents: 0,
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
  },
  showImg: true,
  showFileProperties: false,
  ctimeFormat: 'YYYY-MM-DD HH:mm:ss',
  mtimeFormat: 'YYYY-MM-DD HH:mm:ss',
  propertiesFormat: `${t('created at')} ctime, ${t('updated at')} mtime`
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

export class FilePreviewSettingTab extends PluginSettingTab {
  plugin: FilePreview;

  constructor(app: App, plugin: FilePreview) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("Show preview contents"))
      .setDesc(t("Show preview contents in the file explorer."))
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
      .setName(t('Show image'))
      .setDesc(t("Show image in the preview contents from file content."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showImg)
        .onChange(async (value) => {
          this.plugin.settings.showImg = value;
          await this.plugin.refreshPreviewContents();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Length of the preview contents."))
      .setDesc(t("default: 50"))
      .addText(text => text
        .setPlaceholder("50")
        .setValue(this.plugin.settings.previewcontentslength)
        .onChange(async (value) => {
          this.plugin.settings.previewcontentslength = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Line clamp"))
      .setDesc(t("The number of lines to show in the preview contents.(1 - 10, default: 2)."))
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.lineClamp)
        .onChange(async (value) => {
          this.plugin.settings.lineClamp = value;
          await this.plugin.refreshPreviewContents();
          await this.plugin.saveSettings();
        })
        .setDynamicTooltip()
      )

    new Setting(containerEl)
      .setName(t('Indents of the preview contents'))
      .setDesc(t('The indents of the preview contents.'))
      .addSlider(slider => slider
        .setLimits(0, 10, 1)
        .setValue(this.plugin.settings.indents)
        .onChange(async (value) => {
          this.plugin.settings.indents = value;
          await this.plugin.refreshPreviewContents();
          await this.plugin.saveSettings();
        })
        .setDynamicTooltip()
      )

    new Setting(containerEl).setName(t('Format preview contents')).setHeading();

    new Setting(containerEl)
      .setName(t("Remove frontmatter"))
      .setDesc(t("Remove frontmatter of the file."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.frontmatter)
        .onChange(async (value) => {
          this.plugin.settings.format.frontmatter = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Remove bold and italic symbols"))
      .setDesc(t("Remove bold and italic symbols of the file."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.bolditalic)
        .onChange(async (value) => {
          this.plugin.settings.format.bolditalic = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Remove highlight symbols"))
      .setDesc(t("Remove highlight symbols of the file."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.highlight)
        .onChange(async (value) => {
          this.plugin.settings.format.highlight = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Remove code block"))
      .setDesc(t("Remove code block of the file."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.codeblock)
        .onChange(async (value) => {
          this.plugin.settings.format.codeblock = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Remove quote"))
      .setDesc(t("Remove quote of the file."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.quote)
        .onChange(async (value) => {
          this.plugin.settings.format.quote = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Remove blank line"))
      .setDesc(t("Remove blank line of the file."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.blankline)
        .onChange(async (value) => {
          this.plugin.settings.format.blankline = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Remove title symbol"))
      .setDesc(t("Remove title symbol of the file."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.format.title)
        .onChange(async (value) => {
          this.plugin.settings.format.title = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName(t('File properties')).setHeading();

    new Setting(containerEl)
      .setName(t("Display properties"))
      .setDesc(t("Display file properties under detaile message. For example, created time, updated time, file size."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showFileProperties)
        .onChange(async (value) => {
          this.plugin.settings.showFileProperties = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("Created time format"))
      .setDesc(t("ctime. Time of creation. Default is 'YYYY-MM-DD HH:mm:ss'"))
      .addText(text => text
        .setPlaceholder(this.plugin.settings.ctimeFormat)
        .setValue(this.plugin.settings.ctimeFormat)
        .onChange(async (value) => {
          this.plugin.settings.ctimeFormat = value;
          await this.plugin.saveSettings();
        }))
      .then((settingEl) => this.addResetButton(settingEl, 'ctimeFormat'))

    new Setting(containerEl)
      .setName(t("Modified time format"))
      .setDesc(t("mtime. Time of last modification. Default is 'YYYY-MM-DD HH:mm:ss'"))
      .addText(text => text
        .setPlaceholder(this.plugin.settings.mtimeFormat)
        .setValue(this.plugin.settings.mtimeFormat)
        .onChange(async (value) => {
          this.plugin.settings.mtimeFormat = value;
          await this.plugin.saveSettings();
        }))
      .then((settingEl) => this.addResetButton(settingEl, 'mtimeFormat'))

    new Setting(containerEl)
      .setName(t("Properties format"))
      .setDesc(t("Format of the file properties. Use 'ctime' and 'mtime'."))
      .addText(text => text
        .setPlaceholder(this.plugin.settings.propertiesFormat)
        .setValue(this.plugin.settings.propertiesFormat)
        .onChange(async (value) => {
          this.plugin.settings.propertiesFormat = value;
          await this.plugin.saveSettings();
        }))
      .then((settingEl) => this.addResetButton(settingEl, 'propertiesFormat'))
  }

  addResetButton(settingElement: Setting, settingKey: string, refreshView = true) {
    settingElement
      .addExtraButton((button) => button
        .setIcon('reset')
        .setTooltip(t('Reset to default'))
        .onClick(() => {
          // @ts-ignore
          this.plugin.settings[settingKey] = DEFAULT_SETTINGS[settingKey]
          this.plugin.saveSettings()
          if (refreshView) {
            this.display()
          }
        })
      )
  }
}