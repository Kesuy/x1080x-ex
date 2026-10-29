import './userscript.js';
import {
  installAgaghhhEnhancement,
  installX1080xSettingsMenu,
} from './agaghhh-enhancement.js';
import { installFc2cmadbEnhancement } from './fc2cmadb.js';
import { installHdblogArticleEnhancement } from './hdblog-article.js';
import { installHdblogImageHostSettings } from './hdblog-image-hosts.js';
import { installHdblogPreviewImages } from './hdblog-preview.js';
import { installHdblogReferResolver } from './hdblog-refer.js';
import { installHdblogSearchEnhancement } from './hdblog-search.js';
import { installQbittorrentSettings } from './qbittorrent-settings.js';
import { installHdblogJavfreeFallback, installJavfreeEnhancement } from './javfree.js';
import { installSehuatangEnhancement } from './sehuatang.js';

installFc2cmadbEnhancement();
installX1080xSettingsMenu();
installAgaghhhEnhancement();
installQbittorrentSettings();
installHdblogImageHostSettings();
installHdblogReferResolver();
installHdblogArticleEnhancement();
installHdblogPreviewImages();
void installHdblogJavfreeFallback();
installHdblogSearchEnhancement();
installJavfreeEnhancement();
installSehuatangEnhancement();
