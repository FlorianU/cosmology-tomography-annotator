import os
import numpy as np
from astropy.io import fits
import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter

# --- 1. Configuration ---
#fits_filename = 'manticore_data_cube.fits'  
fits_filename = 'output_cube.fits' 
output_folder = 'slices'
colormap = 'viridis'

# NEW: How many raw FITS slices should be squashed into 1 image?
slices_to_fuse = 4  

os.makedirs(output_folder, exist_ok=True)

print(f"Opening {fits_filename} with Memory Mapping...")
hdul = fits.open(fits_filename, memmap=True)

data_shape = hdul[0].shape
is_4d = len(data_shape) == 4

if is_4d:
    z_slices, y_pixels, x_pixels = data_shape[1], data_shape[2], data_shape[3]
else:
    z_slices, y_pixels, x_pixels = data_shape[0], data_shape[1], data_shape[2]

# Calculate the new total number of images
final_image_count = int(np.ceil(z_slices / slices_to_fuse))
print(f"Original Z-slices: {z_slices}")
print(f"Fusing {slices_to_fuse} slices together per image...")
print(f"New Total Output Images: {final_image_count}")


# print(hdul[0].data/(np.mean(hdul[0].data, axis=[0,1,2]))-1)

# --- 2. Helper Function for Math ---
def process_slice(raw_2d_slice):
    """Applies cleaning, smoothing, and log stretch."""
    clean = np.nan_to_num(raw_2d_slice, nan=0.0, posinf=0.0, neginf=0.0)
    smoothed = gaussian_filter(clean, sigma=0.6) 
    print(f"max: {np.max(smoothed)}")
    print(f"min: {np.min(smoothed)}")
    logversion = np.log10(smoothed + 1)
    clean_clipped = np.clip(logversion, a_min=1e-10, a_max=None)
    return np.log10(clean_clipped)

# --- 3. Estimate Global Contrast (Using Fused Chunks) ---
print("\nEstimating global contrast limits using sample chunks...")
# Pick 5 chunks spaced evenly through the cube
sample_indices = np.linspace(0, final_image_count - 1, 5, dtype=int)
valid_pixels = []

for i in sample_indices:
    start_z = i * slices_to_fuse
    end_z = min(start_z + slices_to_fuse, z_slices)
    
    # Pull a CHUNK of slices into RAM (Safe: ~20MB)
    if is_4d:
        chunk = hdul[0].data[0, start_z:end_z, :, :]
    else:
        chunk = hdul[0].data[start_z:end_z, :, :]
        
    # FUSE THEM: Maximum Intensity Projection
    fused_raw_slice = np.nanmax(chunk, axis=0)
    
    processed_slice = process_slice(fused_raw_slice)
    mask = processed_slice > -9.9
    valid_pixels.extend(processed_slice[mask])

if len(valid_pixels) == 0:
    print("WARNING: All sampled pixels were zero! Check your FITS file.")
    vmin, vmax = -1, 1
else:
    vmin = np.percentile(valid_pixels, 80)   # Crush bottom 80% to black
    vmax = np.percentile(valid_pixels, 99.9) # Top 0.1% to pure white

print(f"Visual Contrast Limits set to: vmin={vmin:.2f}, vmax={vmax:.2f}\n")

# --- 4. Process and Save Fused Slices ---
print(f"Extracting {final_image_count} fused images to '{output_folder}/'...")

for i in range(final_image_count):
    start_z = i * slices_to_fuse
    end_z = min(start_z + slices_to_fuse, z_slices)
    
    # Pull the chunk
    if is_4d:
        chunk = hdul[0].data[0, start_z:end_z, :, :]
    else:
        chunk = hdul[0].data[start_z:end_z, :, :]
    
    # Fuse the chunk into a single 2D array
    fused_raw_slice = np.nanmax(chunk, axis=0)
    
    # Apply math
    final_image = process_slice(fused_raw_slice)
    
    # Save it sequentially
    filename = f"slice_{i:03d}.png"
    filepath = os.path.join(output_folder, filename)
    plt.imsave(filepath, final_image, cmap=colormap, origin='lower', vmin=vmin, vmax=vmax)
    
    if i % 10 == 0:
        print(f"Processed {i}/{final_image_count} fused images...")

hdul.close()
print(f"\nExtraction complete! Successfully generated {final_image_count} images.")