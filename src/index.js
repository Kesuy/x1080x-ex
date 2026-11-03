import './userscript.js';
// Unified site settings are initialized after the legacy runtime.
import { installAgaghhhEnhancement } from './agaghhh-enhancement.js';
import { installUnifiedSettingsMenu } from './settings-center.js';
import { installFc2cmadbEnhancement } from './fc2cmadb.js';
import { installHdblogArticleEnhancement } from './hdblog-article.js';
import { installHdblogImageHostSettings } from './hdblog-image-hosts.js';
import { installHdblogPreviewImages } from './hdblog-preview.js';
import { installHdblogReferResolver } from './hdblog-refer.js';
import { installHdblogSearchEnhancement } from './hdblog-search.js';
import { installQbittorrentSettings } from './qbittorrent-settings.js';
import { installHdblogJavfreeFallback, installJavfreeEnhancement } from './javfree.js';
import { installSehuatangEnhancement } from './sehuatang.js';

installUnifiedSettingsMenu();
installFc2cmadbEnhancement();
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
