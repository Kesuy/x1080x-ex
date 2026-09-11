import './userscript.js';
import {
  installAgaghhhEnhancement,
  installX1080xSettingsMenu,
} from './agaghhh-enhancement.js';
import { installHdblogArticleEnhancement } from './hdblog-article.js';
import { installHdblogImageHostSettings } from './hdblog-image-hosts.js';
import { installHdblogPreviewImages } from './hdblog-preview.js';
import { installHdblogReferResolver } from './hdblog-refer.js';
import { installHdblogSearchEnhancement } from './hdblog-search.js';

installX1080xSettingsMenu();
installAgaghhhEnhancement();
installHdblogImageHostSettings();
installHdblogReferResolver();
installHdblogArticleEnhancement();
installHdblogPreviewImages();
installHdblogSearchEnhancement();
