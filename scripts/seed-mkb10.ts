import db, { initDatabase } from '../src/db/index';

const commonDiagnoses = [
    { code: 'A00.0', display: 'Kolera koju uzrokuje Vibrio cholerae 01, biotip cholerae' },
    { code: 'A09', display: 'Proljev i gastroenteritis za koje se pretpostavlja da su zaraznog podrijetla' },
    { code: 'A60.0', display: 'Herpesvirusna infekcija spolnih organa i mokraćno-spolnog sustava' },
    { code: 'B01.9', display: 'Varičela bez komplikacija' },
    { code: 'B34.9', display: 'Virusna infekcija, nespecificirana' },
    { code: 'E10.9', display: 'Dijabetes melitus tipa 1 (bez komplikacija)' },
    { code: 'E11.9', display: 'Dijabetes melitus tipa 2 (bez komplikacija)' },
    { code: 'E66.0', display: 'Pretilost zbog suvišnog unosa energije' },
    { code: 'F32.9', display: 'Depresivna epizoda, nespecificirana' },
    { code: 'F41.1', display: 'Generalizirani anksiozni poremećaj' },
    { code: 'G43.9', display: 'Migrena, nespecificirana' },
    { code: 'G44.2', display: 'Tenzijska glavobolja' },
    { code: 'H10.9', display: 'Konjunktivitis, nespecificiran' },
    { code: 'I10', display: 'Esencijalna (primarna) hipertenzija' },
    { code: 'I20.9', display: 'Angina pectoris, nespecificirana' },
    { code: 'I25.1', display: 'Aterosklerotična bolest srca' },
    { code: 'I50.0', display: 'Zatajenje srca (kongestivno)' },
    { code: 'I63.9', display: 'Cerebralni infarkt, nespecificiran (Moždani udar)' },
    { code: 'J00', display: 'Akutni nazofaringitis (obična prehlada)' },
    { code: 'J01.9', display: 'Akutni sinusitis, nespecificiran' },
    { code: 'J02.9', display: 'Akutni faringitis (Upala grla), nespecificiran' },
    { code: 'J06.9', display: 'Akutna infekcija gornjega dišnog sustava, nespecificirana' },
    { code: 'J11.1', display: 'Gripa s drugim manifestacijama u dišnom sustavu, virus nije identificiran' },
    { code: 'J18.9', display: 'Pneumonija (Upala pluća), nespecificirana' },
    { code: 'J20.9', display: 'Akutni bronhitis, nespecificiran' },
    { code: 'J30.4', display: 'Alergijski rinitis, nespecificiran' },
    { code: 'J44.9', display: 'Kronična opstruktivna plućna bolest (KOPB), nespecificirana' },
    { code: 'J45.9', display: 'Astma, nespecificirana' },
    { code: 'K21.9', display: 'Gastroezofagealna refluksna bolest (GERB) bez ezofagitisa' },
    { code: 'K29.7', display: 'Gastritis, nespecificiran' },
    { code: 'L20.9', display: 'Atopijski dermatitis, nespecificiran' },
    { code: 'M43.1', display: 'Spondilolisteza' },
    { code: 'M54.5', display: 'Bol u donjem dijelu leđa (Lumbago)' },
    { code: 'N30.0', display: 'Akutni cistitis (Upala mjehura)' },
    { code: 'N39.0', display: 'Infekcija mokraćnog sustava, mjesto nespecificirano' },
    { code: 'R05', display: 'Kašalj' },
    { code: 'R50.9', display: 'Vrućica, nespecificirana' },
    { code: 'R51', display: 'Glavobolja' },
    { code: 'R53', display: 'Malaksalost i umor' },
    { code: 'Z00.0', display: 'Opći medicinski pregled' }
];

async function seedDiagnoses() {
    initDatabase();
    console.log('Seeding MKB-10 diagnoses...');
    const insert = db.prepare('INSERT OR IGNORE INTO diagnoses (code, display) VALUES (?, ?)');

    for (const d of commonDiagnoses) {
        insert.run(d.code, d.display);
    }

    console.log('Done.');
}

seedDiagnoses();
