import './userscript.js';
import { installHdblogArticleEnhancement } from './hdblog-article.js';
import { installHdblogImageHostSettings } from './hdblog-image-hosts.js';
import { installHdblogPreviewImages } from './hdblog-preview.js';
import { installHdblogSearchEnhancement } from './hdblog-search.js';

installHdblogImageHostSettings();
installHdblogArticleEnhancement();
installHdblogPreviewImages();
installHdblogSearchEnhancement();
