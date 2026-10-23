/**
 * Supersampling factor for every generated texture.
 *
 * The canvas is sized in device pixels and the camera zooms by roughly the
 * pixel ratio, so one world unit lands on more than one device pixel on a
 * retina screen. Art generated at one pixel per world unit therefore gets
 * upscaled and looks soft. Drawing at GFX_SCALE and displaying at 1/GFX_SCALE
 * means textures are always sampled down instead, which stays crisp.
 */
export const GFX_SCALE = 2;
