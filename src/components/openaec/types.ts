/**
 * Public types shared between OpenAEC-shell wrappers and App.
 */
export interface FileTab {
  id: number;
  name: string;
  snapshot: string; // Serialized project JSON
}
