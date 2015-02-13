/**
 * extend d3.geo.tile
 *
 * */
d3.geo.tile = function() {
    var zoom = 10,
        sw = [0,0], //lat,lng
        ne = [0,0]; //lat,lng

    function long2tile(lon,zoom) {
        return (Math.floor((lon+180)/360*Math.pow(2,zoom)));
    }

    function lat2tile(lat,zoom)  {
        return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));
    }

    function tile() {
        var k = 256,
            sw_origin = [long2tile(sw.lng(),zoom), lat2tile(sw.lat(),zoom)],
            ne_origin = [long2tile(ne.lng(),zoom), lat2tile(ne.lat(),zoom)],
            tiles = [],
            cols = d3.range(sw_origin[0], ne_origin[0]+1),
            rows = d3.range(ne_origin[1], sw_origin[1]+1);

        rows.forEach(function(y) {
            cols.forEach(function(x) {
                tiles.push([x, y, zoom]);
            });
        });

        tiles.scale = k;
        tiles.translate = [sw_origin[0],ne_origin[1]];

        return tiles;
    }

    tile.zoom = function(_) {
        if (!arguments.length) return zoom;
        zoom = _;
        return tile;
    };

    tile.sw = function(_) {
        if (!arguments.length) return sw;
        sw = _;
        return tile;
    };

    tile.ne = function(_) {
        if (!arguments.length) return ne;
        ne = _;
        return tile;
    };

    return tile;
};
/**
 * @ngdoc directive
 * @name d3-tiles-layer
 * @requires Attr2Options
 * @description
 *   Requires:  map directive
 *   Restrict To:  Element
 *
 * @example
 * Example:
 *
 *   <map zoom="11" center="[41.875696,-87.624207]">
 *     <d3-tiles-layer data="taxiData"></d3-tiles-layer>
 *   </map>
 */
/*jshint -W089*/
ngMap.directive('d3TilesLayer', ['Attr2Options', '$window', function(Attr2Options, $window) {
    var parser = Attr2Options;

    TileOverlay.prototype = new google.maps.OverlayView();
    /** @constructor */
    function TileOverlay(controller,options,events) {

        // Initialize all properties.
        this.controller = controller;
        this.id = options.id;
        this.options = options;
        this.events = events;

        // Define translate property
        this.translate_x = 0;
        this.translate_y = 0;
    }

    /**
     * onAdd is called when the map's panes are ready and the overlay has been
     * added to the map.
     */
    TileOverlay.prototype.onAdd = function() {
        // svg layer
        var overlaysvg = d3.select(this.getPanes().overlayLayer)
            .append("svg")
            .style("width", $window.innerWidth + "px")
            .style("height", $window.innerHeight + "px")
            .style('position','absolute');

        //current private variable
        var options = this.options,
            events = this.events,
            requestUrl = options.tileoptions.urls[0],
            overlayProjection = this.getProjection(),
            markers_map = {};

        //d3 related variable
        var tile = d3.geo.tile(),  // geo tile object
            tilePath = d3.geo.path().projection(googleMapProjection); //d3 path function

        /**
         * Turn the overlay projection into a d3 projection
         *
         * */
        function googleMapProjection(coordinates) {
            var googleCoordinates = new google.maps.LatLng(coordinates[1], coordinates[0]);
            var pixelCoordinates = overlayProjection.fromLatLngToDivPixel(googleCoordinates);
            return [pixelCoordinates.x, pixelCoordinates.y];
        };

        /**
         * load feature from topoJson or geoJson
         * to svg
         * or google markers
         *
         * */
        function loadFeatures(map,controller,svg,json,groupId){

            if(json){
                //load polygons
                svg.selectAll("path")
                    .data(json.features.filter(function(d){return d.geometry.type === 'Polygon';}))
                    .enter().append("path")
                    .attr("class", function(d) { return d.properties.kind; })
                    .attr("d", tilePath);

                //load circles
                var markeroptions = angular.copy(options.markeroptions);
                markers_map[groupId] = [];
                json.features.filter(function(d){return d.geometry.type === 'Point';})
                    .forEach(function(d){
                        markers_map[groupId].push(d.properties[options.markeroptions.id]);

                        markeroptions.position = new google.maps.LatLng(d.geometry.coordinates[1], d.geometry.coordinates[0]);
                        markeroptions.id = d.properties[options.markeroptions.id];

                        var marker = new google.maps.Marker(markeroptions);
                        setEvents(events,marker);
                        controller.addMarker(marker);
                    });
            }
        };

        /**
         * re draw function
         * getting current tiles
         * request data
         * call load feature functions
         *
         * */
        function reDraw(map,controller,translate_x,translate_y){
            //current tiles
            var tiles = tile
                .zoom(map.getZoom())
                .sw(map.getBounds().getSouthWest())
                .ne(map.getBounds().getNorthEast())();

            var image = overlaysvg.selectAll("g.tile").data(tiles, function(d) {
                return d;
            });

            image.exit().each(function(d) {
                this._xhr.abort();

                var groupId = d[0] + '-' + d[1] + '-' + d[2];
                if(groupId in markers_map)
                {
                    markers_map[groupId].forEach(function (d) {
                        var marker = map.markers[d];
                        if(marker){
                            delete map.markers[d];
                            marker.setMap(null);
                        }
                    });
                }

                delete markers_map[groupId];

            }).remove();

            image.enter().append("g").attr("class", "tile").each(function(d) {
                var group = d3.select(this);
                var url = requestUrl + d[2] + "/" + d[0] + "/" + d[1] + ".json";
                this._xhr = d3.json(url, function(error, json) {
                    //load features
                    loadFeatures(map,controller,group,json,d[0]+'-'+d[1]+'-'+d[2]);
                });
            });

            image.attr("transform", "translate(" + translate_x + "," + translate_y + ")");
        }

        /**
         * set events
         */
        function setEvents(events,marker){

            if (Object.keys(events).length > 0) {
                console.log("markerEvents", events);
            }
            for (var eventName in events) {
                if (eventName) {
                    google.maps.event.addListener(marker, eventName, events[eventName]);
                }
            }
        }

        TileOverlay.prototype.draw = function() {
            //re draw tiles
            reDraw(this.map,this.controller,this.translate_x,this.translate_y);
        };

        TileOverlay.prototype.dragged = function() {
            //get current moved x y coordinates
            this.translate_x = -Math.round(this.getProjection().fromLatLngToDivPixel(this.map.getBounds().getSouthWest()).x);
            this.translate_y = -Math.round(this.getProjection().fromLatLngToDivPixel(this.map.getBounds().getNorthEast()).y);

            //move svg element
            overlaysvg.style('left', -this.translate_x).style('top', -this.translate_y);

            //re draw all tiles
            reDraw(this.map,this.controller,this.translate_x,this.translate_y);

        };
    };

    return {
        restrict: 'E',
        require: '^map',

        link: function(scope, element, attrs, mapController) {
            var orgAttrs = parser.orgAttributes(element);
            var filtered = parser.filter(attrs);
            var options = parser.getOptions(filtered);
            var controlOptions = parser.getControlOptions(filtered);
            var events = parser.getEvents(scope, filtered);

            console.log("filtered", filtered, "options", options, 'controlOptions', controlOptions, 'events', events);
            /**
             * set options
             */

            var overlay = new TileOverlay(mapController,options,events);
            /**
             * set events
             */


            mapController.addObject('d3TilesLayers', overlay);
        }
    }; // return
}]);