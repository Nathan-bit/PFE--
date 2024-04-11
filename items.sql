CREATE TABLE sidebar_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_fr VARCHAR(255),
  name_en VARCHAR(255),
  name_ar VARCHAR(255),
  link VARCHAR(255),
  icon VARCHAR(255),
  parent_id INT DEFAULT NULL
);

INSERT INTO `sidebar_items` (`id`, `name_fr`, `name_en`, `link`, `icon`, `parent_id`) VALUES
(1, 'Tableau de bord', 'Dashboard', '/#', 'fas fa-tachometer-alt', NULL),
(2, 'Étudiants', 'Students', '/#', 'fas fa-users', NULL),
(3, 'Enseignants', 'Instructors', '/#', 'fas fa-chalkboard-teacher', NULL),
(4, 'Entreprises', 'Companies', '/#', 'fas fa-building', NULL),
(5, 'Liste des stages', 'Internship List', '/#', 'fas fa-file-alt', NULL),
(6, 'Calendrier', 'Calendar', '/#', 'fas fa-calendar-alt', NULL),
(7, 'Paramètres', 'Settings', '/#', 'fas fa-cog', NULL),
(8, 'Admin', 'Admin', '#', 'fas fa-tasks', NULL),
(9, 'Uploads files', 'Uploads files', '/upload', 'fas fa-upload', 8),
(10, 'Databases', 'Databases', '/gestion', 'fas fa-database', 8),
(11, 'Encadrement', 'Supervision', '/#', 'fas fa-file-alt', NULL);

{
"id": 1,
"NOM": "GABIAM",
"PRENOM": "kossi samuel",
"EMAIL": "kossisamuel.gabiam@fss.u-sfax.tn",
"PASSWORD": "$2b$10$jZkUZG1/or0dEudrstbLM.4kEko/XphA29ffyG4FqBe8iWqaaR49C",
"role": "ADMIN",
"ISVALIDATED": true,
"TOKEN": "0",
"createdAt": "2024-04-07T22:05:03.000Z",
"updatedAt": "2024-04-07T22:05:43.000Z"
}