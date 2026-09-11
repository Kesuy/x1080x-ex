import './userscript.js';
import {
  finishUnifiedSettingsMenuInstall,
  installAgaghhhEnhancement,
  installUnifiedSettingsMenu,
} from './agaghhh-enhancement.js';
import { installHdblogArticleEnhancement } from './hdblog-article.js';
import { installHdblogImageHostSettings } from './hdblog-image-hosts.js';
import { installHdblogPreviewImages } from './hdblog-preview.js';
import { installHdblogReferResolver } from './hdblog-refer.js';
import { installHdblogSearchEnhancement } from './hdblog-search.js';

installUnifiedSettingsMenu();
installAgaghhhEnhancement();
installHdblogImageHostSettings();
installHdblogReferResolver();
installHdblogArticleEnhancement();
finishUnifiedSettingsMenuInstall();
installHdblogPreviewImages();
installHdblogSearchEnhancement();
