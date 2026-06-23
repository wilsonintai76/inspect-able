import fs from 'fs';
import path from 'path';

const androidAssetsPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public');
const adminMobileHtml = path.join(androidAssetsPath, 'admin-mobile.html');
const indexHtml = path.join(androidAssetsPath, 'index.html');

if (fs.existsSync(adminMobileHtml)) {
    // Overwrite index.html with admin-mobile.html inside the Android bundle ONLY
    fs.copyFileSync(adminMobileHtml, indexHtml);
    console.log('✅ Successfully set admin-mobile.html as the primary Android entry point.');
} else {
    console.warn('⚠️ admin-mobile.html not found in Android assets. Did you run cap sync?');
}
