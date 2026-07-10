# Exercise Image Upload

## Overview
Automatic image upload system for exercises. Upload tutorial images directly from the workout page. Images are stored in auto-generated folders by exercise name. Multiple images per exercise rotate as a carousel every 10 seconds.

## Folder Structure
```
public/images/exercises/<slugified-name>/
```
Example: `public/images/exercises/fekvenyomas/`, `public/images/exercises/tamas-kar-elore/`

Slugging: lowercase, Hungarian characters normalized, spaces replaced with hyphens. E.g. "Tamas kar elore" → "tamas-kar-elore".

## API Endpoints

### POST /api/upload/:exerciseName
- Accepts multipart/form-data with a single file field `image`
- Creates the exercise folder if it doesn't exist
- Saves the file with a sanitized original filename (or timestamp-based if conflict)
- Accepted formats: jpg, jpeg, png, gif, webp
- Max size: 10MB
- Returns: `{ filename, path, url }`

### DELETE /api/upload/:exerciseName/:filename
- Deletes the specified image file
- Returns: `{ ok: true }`

### GET /api/exercises/:exerciseName/images
- Lists all images in the exercise folder
- Returns: `{ images: [{ filename, url }] }`

## Frontend (workout.html)

### Image display area
- Replace the current SVG icon area in the exercise header with a larger image area
- If images exist for the exercise, show them as a carousel
- If no images, show the current SVG icon as fallback

### Carousel behavior
- Auto-rotates every 10 seconds
- Small dot indicators below the image
- Click left/right to manually navigate
- Pauses on hover

### Upload
- Small camera icon button overlaid on the image area
- Click triggers a hidden file picker (accept: image/*)
- On select, uploads via POST /api/upload/:exerciseName
- On success, the image list refreshes and the new image appears immediately

## Dependencies
- Hono multipart middleware (built-in)
- No additional npm packages needed
