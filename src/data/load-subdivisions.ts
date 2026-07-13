import subdivisionsAtlas from "./subdivisions-shapes.json";
import subdivisionsMetadata from "./subdivisions-metadata.json";

// Kept behind a dynamic import so the 3.4 MB detailed data set is only parsed
// when a learner actually enables administrative subdivisions.
export { subdivisionsAtlas, subdivisionsMetadata };
