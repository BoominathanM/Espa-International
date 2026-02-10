# Logo Setup Instructions

## Adding Your ESPA International Logo

To display your logo in the application:

1. **Place your logo file** in the `frontend/public/` folder
2. **Name it** `logo.png` (or update the paths in the code if using a different name)
3. **Recommended size**: 200x100px or similar aspect ratio
4. **Supported formats**: PNG, JPG, SVG

### Current Logo References

The logo is referenced in:
- `src/pages/Login.jsx` - Login page
- `src/components/Layout.jsx` - Sidebar header

If your logo file has a different name or location, update these files accordingly.

### Fallback

If the logo file is not found, the application will display "ESPA CRM" text as a fallback.
