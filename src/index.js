import './userscript.js';
import { installHdblogArticleEnhancement } from './hdblog-article.js';
import { installHdblogPreviewImages } from './hdblog-preview.js';
import { installHdblogSearchEnhancement } from './hdblog-search.js';

installHdblogArticleEnhancement();
installHdblogPreviewImages();
installHdblogSearchEnhancement();
