'use strict';
const states = Object.fromEntries('01:AL 02:AK 04:AZ 05:AR 06:CA 08:CO 09:CT 10:DE 11:DC 12:FL 13:GA 15:HI 16:ID 17:IL 18:IN 19:IA 20:KS 21:KY 22:LA 23:ME 24:MD 25:MA 26:MI 27:MN 28:MS 29:MO 30:MT 31:NE 32:NV 33:NH 34:NJ 35:NM 36:NY 37:NC 38:ND 39:OH 40:OK 41:OR 42:PA 44:RI 45:SC 46:SD 47:TN 48:TX 49:UT 50:VT 51:VA 53:WA 54:WV 55:WI 56:WY'.split(' ').map(pair => pair.split(':')));
const stateNames = Object.assign(Object.fromEntries(Object.values(states).map(code => [code, ({
AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
})[code]])),{GU:"Guam",MP:"Northern Mariana Islands",VI:"U.S. Virgin Islands"});
function decode(topology) {
  const {scale,translate} = topology.transform;
  const arcs = topology.arcs.map(arc => {
    let x=0,y=0;
    return arc.map(([dx,dy]) => [(x+=dx)*scale[0]+translate[0],(y+=dy)*scale[1]+translate[1]]);
  });
  return topology.objects.states.geometries.filter(g => states[g.id]).map(g => {
    const rings = (g.type==='MultiPolygon' ? g.arcs : [g.arcs]).map(polygon => polygon.map(ring => ring.flatMap((i,j) => {
      const points = i>=0 ? arcs[i] : [...arcs[~i]].reverse();
      return j ? points.slice(1) : points;
    })));
    return {code:states[g.id], rings};
  });
}
