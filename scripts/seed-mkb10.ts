import db, { initDatabase } from '../src/db/index';

const commonDiagnoses = [
    // A – Zarazne i parazitarne bolesti
    { code: 'A00.0', display: 'Kolera koju uzrokuje Vibrio cholerae 01, biotip cholerae' },
    { code: 'A01.0', display: 'Trbušni tifus (Typhus abdominalis)' },
    { code: 'A02.0', display: 'Salmonelni enteritis' },
    { code: 'A03.9', display: 'Šigeloza (bacilarna dizenterija), nespecificirana' },
    { code: 'A04.7', display: 'Enterokolitis uzrokovan Clostridium difficile' },
    { code: 'A05.9', display: 'Bakterijsko trovanje hranom, nespecificirano' },
    { code: 'A06.9', display: 'Amebijaza, nespecificirana' },
    { code: 'A07.1', display: 'Giardiasis (Lambliasis)' },
    { code: 'A08.0', display: 'Rotavirusni enteritis' },
    { code: 'A09', display: 'Proljev i gastroenteritis za koje se pretpostavlja da su zaraznog podrijetla' },

    { code: 'A15.0', display: 'Tuberkuloza pluća, potvrđena mikroskopski' },
    { code: 'A15.3', display: 'Tuberkuloza pluća, potvrđena nespecificiranim metodama' },
    { code: 'A16.9', display: 'Tuberkuloza dišnog sustava, nespecificirana' },
    { code: 'A18.0', display: 'Tuberkuloza kostiju i zglobova' },
    { code: 'A20.9', display: 'Kuga, nespecificirana' },
    { code: 'A21.9', display: 'Tularemija, nespecificirana' },
    { code: 'A23.9', display: 'Bruceloza, nespecificirana' },
    { code: 'A26.9', display: 'Erizipeloid, nespecificiran' },
    { code: 'A27.9', display: 'Leptospiroza, nespecificirana' },
    { code: 'A28.9', display: 'Zoonotička bakterijska bolest, nespecificirana' },
    { code: 'A30.9', display: 'Lepra (Hansenova bolest), nespecificirana' },
    { code: 'A37.9', display: 'Hripavac (Pertussis), nespecificiran' },
    { code: 'A38', display: 'Šarlah (Scarlatina)' },
    { code: 'A39.0', display: 'Meningokokni meningitis' },
    { code: 'A40.9', display: 'Streptokokna septikemija, nespecificirana' },
    { code: 'A41.9', display: 'Septikemija, nespecificirana' },
    { code: 'A46', display: 'Erizipel (Crveni vjetar)' },
    { code: 'A49.9', display: 'Bakterijska infekcija, nespecificirana' },
    { code: 'A50.9', display: 'Kongenitalni sifilis, nespecificiran' },
    { code: 'A54.9', display: 'Gonokokna infekcija, nespecificirana' },
    { code: 'A56.2', display: 'Klamidijska infekcija mokraćno-spolnog sustava, nespecificirana' },
    { code: 'A60.0', display: 'Herpesvirusna infekcija spolnih organa i mokraćno-spolnog sustava' },
    { code: 'A69.2', display: 'Lajmska bolest (Lyme disease)' },
    { code: 'A71.9', display: 'Trahom, nespecificiran' },
    { code: 'A80.9', display: 'Akutna poliomijelitis, nespecificirana' },
    { code: 'A84.9', display: 'Virusni encefalitis prenesen krpeljima, nespecificiran' },
    { code: 'A87.9', display: 'Virusni meningitis, nespecificiran' },
    { code: 'A90', display: 'Denga groznica (klasična denga)' },
    { code: 'A98.5', display: 'Hemoragijska groznica s bubrežnim sindromom' },

    // B – Druge zarazne bolesti
    { code: 'B01.9', display: 'Varičela bez komplikacija' },
    { code: 'B02.9', display: 'Herpes zoster (Šindre) bez komplikacija' },
    { code: 'B05.9', display: 'Ospice (Morbilli) bez komplikacija' },
    { code: 'B06.9', display: 'Rubeola bez komplikacija' },
    { code: 'B15.9', display: 'Hepatitis A bez jetrene kome' },
    { code: 'B16.9', display: 'Akutni hepatitis B bez delta-uzročnika i bez jetrene kome' },
    { code: 'B18.1', display: 'Kronični hepatitis B bez delta-uzročnika' },
    { code: 'B18.2', display: 'Kronični hepatitis C' },
    { code: 'B20', display: 'Bolest uzrokovana virusom humane imunodeficijencije (HIV)' },
    { code: 'B34.9', display: 'Virusna infekcija, nespecificirana' },
    { code: 'B35.1', display: 'Tinea unguium (Gljivična infekcija nokta)' },
    { code: 'B37.0', display: 'Kandidijazni stomatitis (Soor)' },
    { code: 'B86', display: 'Svrab (Scabies)' },

    // C – Zloćudne novotvorine
    { code: 'C18.9', display: 'Zloćudna novotvorina debelog crijeva, nespecificirana' },
    { code: 'C34.9', display: 'Zloćudna novotvorina bronha i pluća, nespecificirana' },
    { code: 'C50.9', display: 'Zloćudna novotvorina dojke, nespecificirana' },
    { code: 'C61', display: 'Zloćudna novotvorina prostate' },

    // D – Dobroćudne novotvorine i bolesti krvi
    { code: 'D25.9', display: 'Leiomiom maternice (Miom), nespecificiran' },
    { code: 'D50.9', display: 'Sideropenijska anemija, nespecificirana' },
    { code: 'D64.9', display: 'Anemija, nespecificirana' },

    // E – Endokrine, nutritivne i metaboličke bolesti
    { code: 'E03.9', display: 'Hipotireoza, nespecificirana' },
    { code: 'E05.9', display: 'Tireotoksikoza (Hipertireoza), nespecificirana' },
    { code: 'E10.9', display: 'Dijabetes melitus tipa 1 (bez komplikacija)' },
    { code: 'E11.9', display: 'Dijabetes melitus tipa 2 (bez komplikacija)' },
    { code: 'E66.0', display: 'Pretilost zbog suvišnog unosa energije' },
    { code: 'E78.0', display: 'Čista hiperkolesterolemija' },
    { code: 'E78.5', display: 'Hiperlipidemija, nespecificirana' },

    // F – Duševni poremećaji
    { code: 'F10.2', display: 'Poremećaji uzrokovani alkoholom — sindrom ovisnosti' },
    { code: 'F20.9', display: 'Shizofrenija, nespecificirana' },
    { code: 'F32.9', display: 'Depresivna epizoda, nespecificirana' },
    { code: 'F33.9', display: 'Povratni depresivni poremećaj, nespecificiran' },
    { code: 'F41.0', display: 'Panični poremećaj' },
    { code: 'F41.1', display: 'Generalizirani anksiozni poremećaj' },
    { code: 'F43.1', display: 'Posttraumatski stresni poremećaj (PTSP)' },
    { code: 'F45.9', display: 'Somatoformni poremećaj, nespecificiran' },

    // G – Bolesti živčanog sustava
    { code: 'G20', display: 'Parkinsonova bolest' },
    { code: 'G35', display: 'Multipla skleroza' },
    { code: 'G40.9', display: 'Epilepsija, nespecificirana' },
    { code: 'G43.9', display: 'Migrena, nespecificirana' },
    { code: 'G44.2', display: 'Tenzijska glavobolja' },
    { code: 'G47.3', display: 'Apneja u spavanju' },

    // H – Bolesti oka i uha
    { code: 'H10.9', display: 'Konjunktivitis, nespecificiran' },
    { code: 'H25.9', display: 'Senilna katarakta, nespecificirana' },
    { code: 'H40.9', display: 'Glaukom, nespecificiran' },
    { code: 'H66.9', display: 'Upala srednjeg uha (Otitis media), nespecificirana' },

    // I – Bolesti krvožilnog sustava
    { code: 'I10', display: 'Esencijalna (primarna) hipertenzija' },
    { code: 'I11.9', display: 'Hipertenzivna bolest srca bez (kongestivnog) zatajenja srca' },
    { code: 'I20.9', display: 'Angina pectoris, nespecificirana' },
    { code: 'I21.9', display: 'Akutni infarkt miokarda, nespecificiran' },
    { code: 'I25.1', display: 'Aterosklerotična bolest srca' },
    { code: 'I48.9', display: 'Fibrilacija i undulacija atrija, nespecificirana' },
    { code: 'I50.0', display: 'Zatajenje srca (kongestivno)' },
    { code: 'I63.9', display: 'Cerebralni infarkt, nespecificiran (Moždani udar)' },
    { code: 'I70.9', display: 'Ateroskleroza, nespecificirana' },
    { code: 'I83.9', display: 'Proširene vene donjih udova (Varikozne vene), nespecificirane' },

    // J – Bolesti dišnog sustava
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

    // K – Bolesti probavnog sustava
    { code: 'K21.9', display: 'Gastroezofagealna refluksna bolest (GERB) bez ezofagitisa' },
    { code: 'K25.9', display: 'Ulkus želuca (Peptički ulkus), nespecificiran' },
    { code: 'K29.7', display: 'Gastritis, nespecificiran' },
    { code: 'K35.9', display: 'Akutni apendicitis, nespecificiran' },
    { code: 'K40.9', display: 'Ingvinalna hernija, nespecificirana' },
    { code: 'K80.2', display: 'Žučni kamenac bez holecistitisa' },

    // L – Bolesti kože
    { code: 'L20.9', display: 'Atopijski dermatitis, nespecificiran' },
    { code: 'L40.9', display: 'Psorijaza, nespecificirana' },
    { code: 'L50.9', display: 'Urtikarija (Koprivnjača), nespecificirana' },
    { code: 'L70.0', display: 'Acne vulgaris' },

    // M – Bolesti mišićno-koštanog sustava
    { code: 'M06.9', display: 'Reumatoidni artritis, nespecificiran' },
    { code: 'M10.9', display: 'Giht (Ulozi), nespecificiran' },
    { code: 'M17.1', display: 'Primarna gonartroza (Artroza koljena), jednostrana' },
    { code: 'M17.9', display: 'Gonartroza (Artroza koljena), nespecificirana' },
    { code: 'M43.1', display: 'Spondilolisteza' },
    { code: 'M47.9', display: 'Spondiloza, nespecificirana' },
    { code: 'M51.1', display: 'Lumbalni i drugi poremećaji intervertebralnog diska s radikulopatijom' },
    { code: 'M54.5', display: 'Bol u donjem dijelu leđa (Lumbago)' },
    { code: 'M79.3', display: 'Panikulitis, nespecificiran' },
    { code: 'M81.9', display: 'Osteoporoza, nespecificirana' },

    // N – Bolesti mokraćno-spolnog sustava
    { code: 'N18.9', display: 'Kronična bolest bubrega, nespecificirana' },
    { code: 'N20.0', display: 'Kamenac u bubregu' },
    { code: 'N30.0', display: 'Akutni cistitis (Upala mjehura)' },
    { code: 'N39.0', display: 'Infekcija mokraćnog sustava, mjesto nespecificirano' },
    { code: 'N40', display: 'Hiperplazija prostate (BPH)' },
    { code: 'N76.0', display: 'Akutni vaginitis' },

    // R – Simptomi i znakovi
    { code: 'R05', display: 'Kašalj' },
    { code: 'R10.4', display: 'Ostala i nespecificirana bol u trbuhu' },
    { code: 'R11', display: 'Mučnina i povraćanje' },
    { code: 'R42', display: 'Omaglica i vrtoglavica' },
    { code: 'R50.9', display: 'Vrućica, nespecificirana' },
    { code: 'R51', display: 'Glavobolja' },
    { code: 'R53', display: 'Malaksalost i umor' },

    // S/T – Ozljede i trovanja
    { code: 'S52.50', display: 'Prijelom distalnog dijela podlaktice (prijelom ručnog zgloba)' },
    { code: 'S61.0', display: 'Otvorena rana prsta/prstiju s oštećenjem nokta' },
    { code: 'S93.4', display: 'Uganuće gležnja' },
    { code: 'T14.9', display: 'Ozljeda, nespecificirana' },
    { code: 'T78.4', display: 'Alergija, nespecificirana' },

    // Z – Čimbenici koji utječu na zdravstveni status
    { code: 'Z00.0', display: 'Opći medicinski pregled' },
    { code: 'Z01.0', display: 'Pregled očiju i vida' },
    { code: 'Z23', display: 'Potreba za imunizacijom (cijepljenjem)' },
    { code: 'Z30.0', display: 'Opće savjetovanje o kontracepciji' },
    { code: 'Z34.9', display: 'Nadzor normalne trudnoće, nespecificirano' },
    { code: 'Z76.0', display: 'Izdavanje recepta za ponavljanje (Repeat prescription)' },
];

async function seedDiagnoses() {
    initDatabase();
    console.log('Seeding MKB-10 diagnoses...');

    const insertLegacy = db.prepare('INSERT OR IGNORE INTO diagnoses (code, display) VALUES (?, ?)');
    const insertModern = db.prepare('INSERT OR IGNORE INTO terminology_concepts (system, code, display, version) VALUES (?, ?, ?, ?)');
    const ICD10_SYSTEM = 'http://fhir.cezih.hr/specifikacije/CodeSystem/icd10-hr';

    const transaction = db.transaction(() => {
        for (const d of commonDiagnoses) {
            insertLegacy.run(d.code, d.display);
            insertModern.run(ICD10_SYSTEM, d.code, d.display, '1.0');
        }
    });

    transaction();
    console.log('Done.');
}

seedDiagnoses();
