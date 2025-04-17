const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Source logo path
const logoPath = path.join(__dirname, 'src', 'assets', 'logo.jpg');

// Define Android icon sizes for different densities
const androidIcons = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 }
];

// Create square icons
async function generateIcons() {
  for (const icon of androidIcons) {
    const targetDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', icon.name);
    
    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Generate square icon
    await sharp(logoPath)
      .resize(icon.size, icon.size, { 
        fit: 'contain', 
        background: { r: 255, g: 255, b: 255, alpha: 0 } 
      })
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    console.log(`Generated ${icon.name}/ic_launcher.png`);

    // Generate round icon (simply using the same image for now)
    await sharp(logoPath)
      .resize(icon.size, icon.size, { 
        fit: 'contain', 
        background: { r: 255, g: 255, b: 255, alpha: 0 } 
      })
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));

    console.log(`Generated ${icon.name}/ic_launcher_round.png`);
  }
}

// Run the generation process
generateIcons()
  .then(() => console.log('Icon generation complete!'))
  .catch(err => console.error('Error generating icons:', err));